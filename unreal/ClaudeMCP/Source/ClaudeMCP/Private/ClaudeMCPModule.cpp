#include "ClaudeMCPModule.h"

#include "ClaudeMCPSettings.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "HttpPath.h"
#include "HttpServerModule.h"
#include "HttpServerRequest.h"
#include "HttpServerResponse.h"
#include "IHttpRouter.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/EngineVersionComparison.h"
#include "Modules/ModuleManager.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

DEFINE_LOG_CATEGORY_STATIC(LogClaudeMCP, Log, All);

namespace
{
	const TCHAR* EndpointPath = TEXT("/mcp");
	const TCHAR* ServerName = TEXT("unreal-claude-mcp");
	const TCHAR* ServerVersion = TEXT("0.1.0");

	// Newest first; the first entry is offered when the client asks for a version we don't know.
	const TCHAR* SupportedProtocolVersions[] = {
		TEXT("2025-11-25"),
		TEXT("2025-06-18"),
		TEXT("2025-03-26"),
		TEXT("2024-11-05"),
	};

	enum class EJsonRpcError : int32
	{
		ParseError = -32700,
		InvalidRequest = -32600,
		MethodNotFound = -32601,
		InvalidParams = -32602,
	};

	FString JsonToString(const TSharedRef<FJsonObject>& Object)
	{
		FString Out;
		TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> Writer =
			TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Out);
		FJsonSerializer::Serialize(Object, Writer);
		return Out;
	}

	TUniquePtr<FHttpServerResponse> MakeResponse(EHttpServerResponseCodes Code, const FString& Body, const FString& ContentType)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(Body, ContentType);
		Response->Code = Code;
		return Response;
	}

	TSharedPtr<FJsonObject> MakeRpcResult(const TSharedPtr<FJsonValue>& Id, const TSharedPtr<FJsonObject>& Result)
	{
		TSharedPtr<FJsonObject> Reply = MakeShared<FJsonObject>();
		Reply->SetStringField(TEXT("jsonrpc"), TEXT("2.0"));
		Reply->SetField(TEXT("id"), Id.IsValid() ? Id : MakeShared<FJsonValueNull>());
		Reply->SetObjectField(TEXT("result"), Result);
		return Reply;
	}

	TSharedPtr<FJsonObject> MakeRpcError(const TSharedPtr<FJsonValue>& Id, EJsonRpcError Code, const FString& Message)
	{
		TSharedPtr<FJsonObject> Error = MakeShared<FJsonObject>();
		Error->SetNumberField(TEXT("code"), static_cast<int32>(Code));
		Error->SetStringField(TEXT("message"), Message);

		TSharedPtr<FJsonObject> Reply = MakeShared<FJsonObject>();
		Reply->SetStringField(TEXT("jsonrpc"), TEXT("2.0"));
		Reply->SetField(TEXT("id"), Id.IsValid() ? Id : MakeShared<FJsonValueNull>());
		Reply->SetObjectField(TEXT("error"), Error);
		return Reply;
	}

	FString GetHeader(const FHttpServerRequest& Request, const TCHAR* Name)
	{
		// FString keys hash and compare case-insensitively, so "host" finds "Host".
		const TArray<FString>* Values = Request.Headers.Find(Name);
		return (Values && Values->Num() > 0) ? (*Values)[0].TrimStartAndEnd() : FString();
	}

	/** "localhost:8765" -> "localhost", "[::1]:8765" -> "[::1]". */
	FString StripPort(const FString& HostAndPort)
	{
		if (HostAndPort.StartsWith(TEXT("[")))
		{
			int32 Close = INDEX_NONE;
			return HostAndPort.FindChar(TEXT(']'), Close) ? HostAndPort.Left(Close + 1) : HostAndPort;
		}
		int32 Colon = INDEX_NONE;
		return HostAndPort.FindChar(TEXT(':'), Colon) ? HostAndPort.Left(Colon) : HostAndPort;
	}

	bool IsLoopbackHost(const FString& Host)
	{
		const FString Lower = Host.ToLower();
		return Lower == TEXT("localhost") || Lower == TEXT("127.0.0.1") || Lower == TEXT("[::1]");
	}
}

void FClaudeMCPModule::StartupModule()
{
	if (IsRunningCommandlet())
	{
		return;
	}

	if (GetDefault<UClaudeMCPSettings>()->bAutoStart)
	{
		StartServer();
	}
}

void FClaudeMCPModule::ShutdownModule()
{
	StopServer();
}

void FClaudeMCPModule::StartServer()
{
	const UClaudeMCPSettings* Settings = GetDefault<UClaudeMCPSettings>();

	if (Settings->bLocalhostOnly)
	{
		// Read by the HTTP server when a listener starts. Applies to listeners started after this point.
		GConfig->SetString(TEXT("HTTPServer.Listeners"), TEXT("DefaultBindAddress"), TEXT("127.0.0.1"), GEngineIni);
	}

	Tools = ClaudeMCPTools::CreateTools();

	FHttpServerModule& HttpServer = FHttpServerModule::Get();
	Router = HttpServer.GetHttpRouter(Settings->Port);
	if (!Router.IsValid())
	{
		UE_LOG(LogClaudeMCP, Error, TEXT("Could not open an HTTP router on port %d. Change the port in Editor Preferences > Plugins > Claude MCP."), Settings->Port);
		return;
	}

	const EHttpServerRequestVerbs Verbs =
		EHttpServerRequestVerbs::VERB_POST | EHttpServerRequestVerbs::VERB_GET | EHttpServerRequestVerbs::VERB_DELETE;

#if UE_VERSION_OLDER_THAN(5, 4, 0)
	RouteHandle = Router->BindRoute(FHttpPath(EndpointPath), Verbs,
		[this](const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
		{
			return HandleRequest(Request, OnComplete);
		});
#else
	RouteHandle = Router->BindRoute(FHttpPath(EndpointPath), Verbs,
		FHttpRequestHandler::CreateRaw(this, &FClaudeMCPModule::HandleRequest));
#endif

	if (!RouteHandle.IsValid())
	{
		UE_LOG(LogClaudeMCP, Error, TEXT("Could not bind %s on port %d (is another plugin using it?)."), EndpointPath, Settings->Port);
		return;
	}

	HttpServer.StartAllListeners();
	UE_LOG(LogClaudeMCP, Log, TEXT("MCP server listening on http://127.0.0.1:%d%s with %d tools."), Settings->Port, EndpointPath, Tools.Num());
}

void FClaudeMCPModule::StopServer()
{
	if (Router.IsValid() && RouteHandle.IsValid())
	{
		Router->UnbindRoute(RouteHandle);
	}
	RouteHandle.Reset();
	Router.Reset();
	Tools.Reset();
}

bool FClaudeMCPModule::IsRequestAllowed(const FHttpServerRequest& Request, EHttpServerResponseCodes& OutStatus, FString& OutReason) const
{
	// Reject DNS-rebinding attempts: a web page can only reach us under a non-loopback hostname.
	const FString Host = GetHeader(Request, TEXT("Host"));
	if (!Host.IsEmpty() && !IsLoopbackHost(StripPort(Host)))
	{
		OutStatus = EHttpServerResponseCodes::Forbidden;
		OutReason = TEXT("Host must be localhost or 127.0.0.1.");
		return false;
	}

	FString Origin = GetHeader(Request, TEXT("Origin"));
	if (!Origin.IsEmpty())
	{
		int32 SchemeEnd = Origin.Find(TEXT("://"));
		if (SchemeEnd != INDEX_NONE)
		{
			Origin.RightChopInline(SchemeEnd + 3);
		}
		if (!IsLoopbackHost(StripPort(Origin)))
		{
			OutStatus = EHttpServerResponseCodes::Forbidden;
			OutReason = TEXT("Cross-origin requests are not allowed.");
			return false;
		}
	}

	const FString& Token = GetDefault<UClaudeMCPSettings>()->AuthToken;
	if (!Token.IsEmpty() && GetHeader(Request, TEXT("Authorization")) != FString::Printf(TEXT("Bearer %s"), *Token))
	{
		OutStatus = EHttpServerResponseCodes::Denied;
		OutReason = TEXT("Missing or wrong bearer token.");
		return false;
	}

	return true;
}

bool FClaudeMCPModule::HandleRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
{
	EHttpServerResponseCodes Status = EHttpServerResponseCodes::Forbidden;
	FString Reason;
	if (!IsRequestAllowed(Request, Status, Reason))
	{
		OnComplete(MakeResponse(Status, Reason, TEXT("text/plain")));
		return true;
	}

	// Streamable HTTP: we answer every POST with plain JSON and don't offer a server-initiated SSE stream.
	if (Request.Verb != EHttpServerRequestVerbs::VERB_POST)
	{
		OnComplete(MakeResponse(EHttpServerResponseCodes::BadMethod, TEXT("Only POST is supported."), TEXT("text/plain")));
		return true;
	}

	FUTF8ToTCHAR Converted(reinterpret_cast<const ANSICHAR*>(Request.Body.GetData()), Request.Body.Num());
	const FString Body(Converted.Length(), Converted.Get());

	TSharedPtr<FJsonObject> Message;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
	if (!FJsonSerializer::Deserialize(Reader, Message) || !Message.IsValid())
	{
		const TSharedPtr<FJsonObject> Error = MakeRpcError(nullptr, EJsonRpcError::ParseError, TEXT("Body must be a single JSON-RPC object."));
		OnComplete(MakeResponse(EHttpServerResponseCodes::Ok, JsonToString(Error.ToSharedRef()), TEXT("application/json")));
		return true;
	}

	// Notifications (no id) and responses to server requests (no method) get 202 with no body.
	if (!Message->HasField(TEXT("id")) || !Message->HasField(TEXT("method")))
	{
		OnComplete(MakeResponse(EHttpServerResponseCodes::Accepted, FString(), TEXT("text/plain")));
		return true;
	}

	const TSharedPtr<FJsonObject> Reply = HandleRpc(*Message);
	OnComplete(MakeResponse(EHttpServerResponseCodes::Ok, JsonToString(Reply.ToSharedRef()), TEXT("application/json")));
	return true;
}

TSharedPtr<FJsonObject> FClaudeMCPModule::HandleRpc(const FJsonObject& Message)
{
	const TSharedPtr<FJsonValue> Id = Message.Values.FindRef(TEXT("id"));

	FString Method;
	Message.TryGetStringField(TEXT("method"), Method);

	const TSharedPtr<FJsonObject>* ParamsField = nullptr;
	const TSharedPtr<FJsonObject> Params = Message.TryGetObjectField(TEXT("params"), ParamsField)
		? *ParamsField
		: MakeShared<FJsonObject>();

	if (Method == TEXT("initialize"))
	{
		return MakeRpcResult(Id, HandleInitialize(*Params));
	}
	if (Method == TEXT("ping"))
	{
		return MakeRpcResult(Id, MakeShared<FJsonObject>());
	}
	if (Method == TEXT("tools/list"))
	{
		return MakeRpcResult(Id, HandleToolsList());
	}
	if (Method == TEXT("tools/call"))
	{
		FString Name;
		if (!Params->TryGetStringField(TEXT("name"), Name))
		{
			return MakeRpcError(Id, EJsonRpcError::InvalidParams, TEXT("tools/call needs a 'name'."));
		}

		const FClaudeMCPTool* Tool = Tools.FindByPredicate([&Name](const FClaudeMCPTool& Candidate) { return Candidate.Name == Name; });
		if (!Tool)
		{
			return MakeRpcError(Id, EJsonRpcError::InvalidParams, FString::Printf(TEXT("Unknown tool '%s'."), *Name));
		}

		const TSharedPtr<FJsonObject>* ArgsField = nullptr;
		const TSharedPtr<FJsonObject> Args = Params->TryGetObjectField(TEXT("arguments"), ArgsField)
			? *ArgsField
			: MakeShared<FJsonObject>();

		UE_LOG(LogClaudeMCP, Log, TEXT("tools/call %s"), *Name);
		const FClaudeMCPToolResult ToolResult = Tool->Execute(Args);

		TSharedPtr<FJsonObject> Content = MakeShared<FJsonObject>();
		Content->SetStringField(TEXT("type"), TEXT("text"));
		Content->SetStringField(TEXT("text"), ToolResult.Text);

		TArray<TSharedPtr<FJsonValue>> ContentArray;
		ContentArray.Add(MakeShared<FJsonValueObject>(Content));

		TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
		Result->SetArrayField(TEXT("content"), ContentArray);
		Result->SetBoolField(TEXT("isError"), ToolResult.bIsError);
		return MakeRpcResult(Id, Result);
	}

	return MakeRpcError(Id, EJsonRpcError::MethodNotFound, FString::Printf(TEXT("Method '%s' is not supported."), *Method));
}

TSharedPtr<FJsonObject> FClaudeMCPModule::HandleInitialize(const FJsonObject& Params) const
{
	FString Requested;
	Params.TryGetStringField(TEXT("protocolVersion"), Requested);

	FString Negotiated = SupportedProtocolVersions[0];
	for (const TCHAR* Version : SupportedProtocolVersions)
	{
		if (Requested == Version)
		{
			Negotiated = Version;
			break;
		}
	}

	TSharedPtr<FJsonObject> Capabilities = MakeShared<FJsonObject>();
	Capabilities->SetObjectField(TEXT("tools"), MakeShared<FJsonObject>());

	TSharedPtr<FJsonObject> ServerInfo = MakeShared<FJsonObject>();
	ServerInfo->SetStringField(TEXT("name"), ServerName);
	ServerInfo->SetStringField(TEXT("version"), ServerVersion);

	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetStringField(TEXT("protocolVersion"), Negotiated);
	Result->SetObjectField(TEXT("capabilities"), Capabilities);
	Result->SetObjectField(TEXT("serverInfo"), ServerInfo);
	Result->SetStringField(TEXT("instructions"),
		TEXT("Tools run inside the open Unreal Editor and act on the current editor level. ")
		TEXT("Actors are addressed by their label as shown in the Outliner. Units are centimeters, rotations are degrees [pitch, yaw, roll]. ")
		TEXT("Edits made by spawn_actor, delete_actors and set_actor_transform can be undone with Ctrl+Z. ")
		TEXT("For anything the dedicated tools don't cover, use execute_python with the 'unreal' module."));
	return Result;
}

TSharedPtr<FJsonObject> FClaudeMCPModule::HandleToolsList() const
{
	TArray<TSharedPtr<FJsonValue>> ToolValues;
	for (const FClaudeMCPTool& Tool : Tools)
	{
		TSharedPtr<FJsonObject> Entry = MakeShared<FJsonObject>();
		Entry->SetStringField(TEXT("name"), Tool.Name);
		Entry->SetStringField(TEXT("description"), Tool.Description);
		Entry->SetObjectField(TEXT("inputSchema"), Tool.InputSchema);
		ToolValues.Add(MakeShared<FJsonValueObject>(Entry));
	}

	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetArrayField(TEXT("tools"), ToolValues);
	return Result;
}

IMPLEMENT_MODULE(FClaudeMCPModule, ClaudeMCP)
