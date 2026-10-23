#include "ClaudeMCPTools.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/IAssetRegistry.h"
#include "ClaudeMCPSettings.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonValue.h"
#include "Editor.h"
#include "Engine/Blueprint.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"
#include "IPythonScriptPlugin.h"
#include "Misc/EngineVersion.h"
#include "Misc/OutputDevice.h"
#include "Modules/ModuleManager.h"
#include "ScopedTransaction.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "Subsystems/EditorActorSubsystem.h"

#define LOCTEXT_NAMESPACE "ClaudeMCP"

namespace
{
	TSharedPtr<FJsonObject> ParseSchema(const TCHAR* Json)
	{
		TSharedPtr<FJsonObject> Schema;
		TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
		if (!FJsonSerializer::Deserialize(Reader, Schema) || !Schema.IsValid())
		{
			Schema = MakeShared<FJsonObject>();
			Schema->SetStringField(TEXT("type"), TEXT("object"));
		}
		return Schema;
	}

	FString ToPrettyJson(const TSharedRef<FJsonObject>& Object)
	{
		FString Out;
		TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
		FJsonSerializer::Serialize(Object, Writer);
		return Out;
	}

	UWorld* GetEditorWorld()
	{
		return GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	}

	UEditorActorSubsystem* GetActorSubsystem()
	{
		return GEditor ? GEditor->GetEditorSubsystem<UEditorActorSubsystem>() : nullptr;
	}

	TArray<TSharedPtr<FJsonValue>> NumbersToJson(double A, double B, double C)
	{
		TArray<TSharedPtr<FJsonValue>> Values;
		Values.Add(MakeShared<FJsonValueNumber>(A));
		Values.Add(MakeShared<FJsonValueNumber>(B));
		Values.Add(MakeShared<FJsonValueNumber>(C));
		return Values;
	}

	/** Accepts [x, y, z] or {"x":..,"y":..,"z":..}. Missing object keys keep their current value. */
	bool ReadVector(const TSharedPtr<FJsonObject>& Args, const TCHAR* Field, FVector& InOut)
	{
		const TArray<TSharedPtr<FJsonValue>>* Array = nullptr;
		if (Args->TryGetArrayField(Field, Array) && Array->Num() == 3)
		{
			InOut = FVector((*Array)[0]->AsNumber(), (*Array)[1]->AsNumber(), (*Array)[2]->AsNumber());
			return true;
		}
		const TSharedPtr<FJsonObject>* Object = nullptr;
		if (Args->TryGetObjectField(Field, Object))
		{
			(*Object)->TryGetNumberField(TEXT("x"), InOut.X);
			(*Object)->TryGetNumberField(TEXT("y"), InOut.Y);
			(*Object)->TryGetNumberField(TEXT("z"), InOut.Z);
			return true;
		}
		return false;
	}

	/** Accepts [pitch, yaw, roll] or {"pitch":..,"yaw":..,"roll":..}. */
	bool ReadRotator(const TSharedPtr<FJsonObject>& Args, const TCHAR* Field, FRotator& InOut)
	{
		const TArray<TSharedPtr<FJsonValue>>* Array = nullptr;
		if (Args->TryGetArrayField(Field, Array) && Array->Num() == 3)
		{
			InOut = FRotator((*Array)[0]->AsNumber(), (*Array)[1]->AsNumber(), (*Array)[2]->AsNumber());
			return true;
		}
		const TSharedPtr<FJsonObject>* Object = nullptr;
		if (Args->TryGetObjectField(Field, Object))
		{
			(*Object)->TryGetNumberField(TEXT("pitch"), InOut.Pitch);
			(*Object)->TryGetNumberField(TEXT("yaw"), InOut.Yaw);
			(*Object)->TryGetNumberField(TEXT("roll"), InOut.Roll);
			return true;
		}
		return false;
	}

	TSharedPtr<FJsonObject> ActorToJson(const AActor* Actor)
	{
		TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
		Out->SetStringField(TEXT("label"), Actor->GetActorLabel());
		Out->SetStringField(TEXT("name"), Actor->GetName());
		Out->SetStringField(TEXT("class"), Actor->GetClass()->GetName());
		Out->SetStringField(TEXT("folder"), Actor->GetFolderPath().ToString());

		const FVector Location = Actor->GetActorLocation();
		const FRotator Rotation = Actor->GetActorRotation();
		const FVector Scale = Actor->GetActorScale3D();
		Out->SetArrayField(TEXT("location"), NumbersToJson(Location.X, Location.Y, Location.Z));
		Out->SetArrayField(TEXT("rotation"), NumbersToJson(Rotation.Pitch, Rotation.Yaw, Rotation.Roll));
		Out->SetArrayField(TEXT("scale"), NumbersToJson(Scale.X, Scale.Y, Scale.Z));
		return Out;
	}

	/** Matches the Outliner label first, then the internal object name. */
	AActor* FindActor(UWorld* World, const FString& LabelOrName)
	{
		AActor* ByName = nullptr;
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			if (It->GetActorLabel() == LabelOrName)
			{
				return *It;
			}
			if (!ByName && It->GetName() == LabelOrName)
			{
				ByName = *It;
			}
		}
		return ByName;
	}

	/** "Cube" etc. map to engine basic shapes so simple scenes need no asset paths. */
	const TCHAR* BasicShapeMesh(const FString& Name)
	{
		if (Name == TEXT("Cube")) return TEXT("/Engine/BasicShapes/Cube.Cube");
		if (Name == TEXT("Sphere")) return TEXT("/Engine/BasicShapes/Sphere.Sphere");
		if (Name == TEXT("Cylinder")) return TEXT("/Engine/BasicShapes/Cylinder.Cylinder");
		if (Name == TEXT("Cone")) return TEXT("/Engine/BasicShapes/Cone.Cone");
		if (Name == TEXT("Plane")) return TEXT("/Engine/BasicShapes/Plane.Plane");
		return nullptr;
	}

	UClass* ResolveActorClass(const FString& ClassName)
	{
		UClass* Class = nullptr;
		if (ClassName.Contains(TEXT("/")))
		{
			Class = LoadObject<UClass>(nullptr, *ClassName);
			if (!Class)
			{
				if (UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *ClassName))
				{
					Class = Blueprint->GeneratedClass;
				}
			}
		}
		else
		{
			Class = UClass::TryFindTypeSlow<UClass>(ClassName);
			// Allow the C++ spelling, e.g. "APointLight".
			if (!Class && ClassName.Len() > 1 && ClassName[0] == TEXT('A'))
			{
				Class = UClass::TryFindTypeSlow<UClass>(ClassName.Mid(1));
			}
		}
		return (Class && Class->IsChildOf(AActor::StaticClass())) ? Class : nullptr;
	}

	class FCaptureOutputDevice : public FOutputDevice
	{
	public:
		FString Text;

		virtual void Serialize(const TCHAR* Message, ELogVerbosity::Type Verbosity, const FName& Category) override
		{
			Text += Message;
			Text += TEXT("\n");
		}
	};

	// --- Tools ---------------------------------------------------------------

	FClaudeMCPToolResult GetLevelInfo(const TSharedPtr<FJsonObject>& Args)
	{
		UWorld* World = GetEditorWorld();
		if (!World)
		{
			return FClaudeMCPToolResult::Error(TEXT("No editor world is loaded."));
		}

		int32 ActorCount = 0;
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			++ActorCount;
		}

		TArray<TSharedPtr<FJsonValue>> Selected;
		if (UEditorActorSubsystem* Actors = GetActorSubsystem())
		{
			for (AActor* Actor : Actors->GetSelectedLevelActors())
			{
				Selected.Add(MakeShared<FJsonValueObject>(ActorToJson(Actor)));
			}
		}

		TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
		Out->SetStringField(TEXT("engine_version"), FEngineVersion::Current().ToString());
		Out->SetStringField(TEXT("map"), World->GetMapName());
		Out->SetStringField(TEXT("package"), World->GetOutermost()->GetName());
		Out->SetNumberField(TEXT("actor_count"), ActorCount);
		Out->SetBoolField(TEXT("play_in_editor_running"), GEditor->PlayWorld != nullptr);
		Out->SetArrayField(TEXT("selected_actors"), Selected);
		return FClaudeMCPToolResult::Ok(ToPrettyJson(Out.ToSharedRef()));
	}

	FClaudeMCPToolResult ListActors(const TSharedPtr<FJsonObject>& Args)
	{
		UWorld* World = GetEditorWorld();
		if (!World)
		{
			return FClaudeMCPToolResult::Error(TEXT("No editor world is loaded."));
		}

		FString ClassFilter;
		FString NameFilter;
		int32 Limit = 200;
		Args->TryGetStringField(TEXT("class_filter"), ClassFilter);
		Args->TryGetStringField(TEXT("name_filter"), NameFilter);
		Args->TryGetNumberField(TEXT("limit"), Limit);

		TArray<TSharedPtr<FJsonValue>> Results;
		int32 Matches = 0;
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			const AActor* Actor = *It;
			if (!ClassFilter.IsEmpty() && !Actor->GetClass()->GetName().Contains(ClassFilter))
			{
				continue;
			}
			if (!NameFilter.IsEmpty() && !Actor->GetActorLabel().Contains(NameFilter) && !Actor->GetName().Contains(NameFilter))
			{
				continue;
			}
			++Matches;
			if (Results.Num() < Limit)
			{
				Results.Add(MakeShared<FJsonValueObject>(ActorToJson(Actor)));
			}
		}

		TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
		Out->SetNumberField(TEXT("total_matches"), Matches);
		Out->SetNumberField(TEXT("returned"), Results.Num());
		Out->SetArrayField(TEXT("actors"), Results);
		return FClaudeMCPToolResult::Ok(ToPrettyJson(Out.ToSharedRef()));
	}

	FClaudeMCPToolResult SpawnActor(const TSharedPtr<FJsonObject>& Args)
	{
		UEditorActorSubsystem* Actors = GetActorSubsystem();
		if (!Actors || !GetEditorWorld())
		{
			return FClaudeMCPToolResult::Error(TEXT("No editor world is loaded."));
		}

		FString ClassName;
		if (!Args->TryGetStringField(TEXT("class"), ClassName) || ClassName.IsEmpty())
		{
			return FClaudeMCPToolResult::Error(TEXT("Missing 'class'."));
		}

		FString MeshPath;
		Args->TryGetStringField(TEXT("static_mesh"), MeshPath);
		if (const TCHAR* ShapeMesh = BasicShapeMesh(ClassName))
		{
			ClassName = TEXT("StaticMeshActor");
			if (MeshPath.IsEmpty())
			{
				MeshPath = ShapeMesh;
			}
		}

		UClass* Class = ResolveActorClass(ClassName);
		if (!Class)
		{
			return FClaudeMCPToolResult::Error(FString::Printf(
				TEXT("'%s' is not an actor class. Use a native name like 'PointLight' or a path like '/Game/BP_Door.BP_Door_C'."), *ClassName));
		}

		UStaticMesh* Mesh = nullptr;
		if (!MeshPath.IsEmpty())
		{
			Mesh = LoadObject<UStaticMesh>(nullptr, *MeshPath);
			if (!Mesh)
			{
				return FClaudeMCPToolResult::Error(FString::Printf(TEXT("Static mesh '%s' not found."), *MeshPath));
			}
		}

		FVector Location = FVector::ZeroVector;
		FRotator Rotation = FRotator::ZeroRotator;
		FVector Scale = FVector::OneVector;
		ReadVector(Args, TEXT("location"), Location);
		ReadRotator(Args, TEXT("rotation"), Rotation);
		ReadVector(Args, TEXT("scale"), Scale);

		const FScopedTransaction Transaction(LOCTEXT("SpawnActor", "Claude MCP: Spawn Actor"));
		AActor* Actor = Actors->SpawnActorFromClass(Class, Location, Rotation);
		if (!Actor)
		{
			return FClaudeMCPToolResult::Error(TEXT("Spawning failed (see the Output Log)."));
		}

		Actor->SetActorScale3D(Scale);

		FString Label;
		if (Args->TryGetStringField(TEXT("label"), Label) && !Label.IsEmpty())
		{
			Actor->SetActorLabel(Label);
		}

		if (Mesh)
		{
			AStaticMeshActor* MeshActor = Cast<AStaticMeshActor>(Actor);
			if (!MeshActor)
			{
				return FClaudeMCPToolResult::Error(TEXT("Actor spawned, but 'static_mesh' only applies to StaticMeshActor."));
			}
			MeshActor->GetStaticMeshComponent()->SetStaticMesh(Mesh);
		}

		return FClaudeMCPToolResult::Ok(ToPrettyJson(ActorToJson(Actor).ToSharedRef()));
	}

	FClaudeMCPToolResult DeleteActors(const TSharedPtr<FJsonObject>& Args)
	{
		UWorld* World = GetEditorWorld();
		UEditorActorSubsystem* Actors = GetActorSubsystem();
		if (!World || !Actors)
		{
			return FClaudeMCPToolResult::Error(TEXT("No editor world is loaded."));
		}

		TArray<FString> Labels;
		if (!Args->TryGetStringArrayField(TEXT("labels"), Labels) || Labels.Num() == 0)
		{
			return FClaudeMCPToolResult::Error(TEXT("Missing 'labels'."));
		}

		const FScopedTransaction Transaction(LOCTEXT("DeleteActors", "Claude MCP: Delete Actors"));
		TArray<FString> Deleted;
		TArray<FString> Missing;
		for (const FString& Label : Labels)
		{
			AActor* Actor = FindActor(World, Label);
			if (Actor && Actors->DestroyActor(Actor))
			{
				Deleted.Add(Label);
			}
			else
			{
				Missing.Add(Label);
			}
		}

		FString Text = FString::Printf(TEXT("Deleted %d actor(s): %s"), Deleted.Num(), *FString::Join(Deleted, TEXT(", ")));
		if (Missing.Num() > 0)
		{
			Text += FString::Printf(TEXT("\nNot found: %s"), *FString::Join(Missing, TEXT(", ")));
		}
		return Deleted.Num() > 0 ? FClaudeMCPToolResult::Ok(Text) : FClaudeMCPToolResult::Error(Text);
	}

	FClaudeMCPToolResult SetActorTransform(const TSharedPtr<FJsonObject>& Args)
	{
		UWorld* World = GetEditorWorld();
		if (!World)
		{
			return FClaudeMCPToolResult::Error(TEXT("No editor world is loaded."));
		}

		FString Label;
		if (!Args->TryGetStringField(TEXT("label"), Label))
		{
			return FClaudeMCPToolResult::Error(TEXT("Missing 'label'."));
		}

		AActor* Actor = FindActor(World, Label);
		if (!Actor)
		{
			return FClaudeMCPToolResult::Error(FString::Printf(TEXT("No actor labelled '%s'."), *Label));
		}

		const FScopedTransaction Transaction(LOCTEXT("SetTransform", "Claude MCP: Set Actor Transform"));
		Actor->Modify();

		FVector Location = Actor->GetActorLocation();
		FRotator Rotation = Actor->GetActorRotation();
		FVector Scale = Actor->GetActorScale3D();
		if (ReadVector(Args, TEXT("location"), Location))
		{
			Actor->SetActorLocation(Location);
		}
		if (ReadRotator(Args, TEXT("rotation"), Rotation))
		{
			Actor->SetActorRotation(Rotation);
		}
		if (ReadVector(Args, TEXT("scale"), Scale))
		{
			Actor->SetActorScale3D(Scale);
		}
		Actor->PostEditMove(true);

		return FClaudeMCPToolResult::Ok(ToPrettyJson(ActorToJson(Actor).ToSharedRef()));
	}

	FClaudeMCPToolResult FindAssets(const TSharedPtr<FJsonObject>& Args)
	{
		FString Path = TEXT("/Game");
		FString ClassFilter;
		FString NameFilter;
		int32 Limit = 200;
		Args->TryGetStringField(TEXT("path"), Path);
		Args->TryGetStringField(TEXT("class_filter"), ClassFilter);
		Args->TryGetStringField(TEXT("name_filter"), NameFilter);
		Args->TryGetNumberField(TEXT("limit"), Limit);

		IAssetRegistry& Registry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry")).Get();

		FARFilter Filter;
		Filter.PackagePaths.Add(FName(*Path));
		Filter.bRecursivePaths = true;

		TArray<FAssetData> Assets;
		Registry.GetAssets(Filter, Assets);

		TArray<TSharedPtr<FJsonValue>> Results;
		int32 Matches = 0;
		for (const FAssetData& Asset : Assets)
		{
			const FString ClassName = Asset.AssetClassPath.GetAssetName().ToString();
			const FString AssetName = Asset.AssetName.ToString();
			if (!ClassFilter.IsEmpty() && !ClassName.Contains(ClassFilter))
			{
				continue;
			}
			if (!NameFilter.IsEmpty() && !AssetName.Contains(NameFilter))
			{
				continue;
			}
			++Matches;
			if (Results.Num() < Limit)
			{
				TSharedPtr<FJsonObject> Entry = MakeShared<FJsonObject>();
				Entry->SetStringField(TEXT("name"), AssetName);
				Entry->SetStringField(TEXT("class"), ClassName);
				Entry->SetStringField(TEXT("path"), Asset.GetObjectPathString());
				Results.Add(MakeShared<FJsonValueObject>(Entry));
			}
		}

		TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
		Out->SetNumberField(TEXT("total_matches"), Matches);
		Out->SetNumberField(TEXT("returned"), Results.Num());
		Out->SetBoolField(TEXT("registry_still_scanning"), Registry.IsLoadingAssets());
		Out->SetArrayField(TEXT("assets"), Results);
		return FClaudeMCPToolResult::Ok(ToPrettyJson(Out.ToSharedRef()));
	}

	FClaudeMCPToolResult RunConsoleCommand(const TSharedPtr<FJsonObject>& Args)
	{
		FString Command;
		if (!Args->TryGetStringField(TEXT("command"), Command) || Command.IsEmpty())
		{
			return FClaudeMCPToolResult::Error(TEXT("Missing 'command'."));
		}
		if (!GEditor)
		{
			return FClaudeMCPToolResult::Error(TEXT("The editor is not available."));
		}

		FCaptureOutputDevice Capture;
		const bool bHandled = GEditor->Exec(GetEditorWorld(), *Command, Capture);
		if (!bHandled)
		{
			return FClaudeMCPToolResult::Error(FString::Printf(TEXT("Command not recognised: %s"), *Command));
		}
		return FClaudeMCPToolResult::Ok(Capture.Text.IsEmpty()
			? TEXT("Command ran. Its output (if any) went to the Output Log.")
			: Capture.Text);
	}

	FClaudeMCPToolResult ExecutePython(const TSharedPtr<FJsonObject>& Args)
	{
		FString Code;
		if (!Args->TryGetStringField(TEXT("code"), Code) || Code.IsEmpty())
		{
			return FClaudeMCPToolResult::Error(TEXT("Missing 'code'."));
		}

		IPythonScriptPlugin* Python = IPythonScriptPlugin::Get();
		if (!Python || !Python->IsPythonAvailable())
		{
			return FClaudeMCPToolResult::Error(TEXT("Python is not available. Enable the 'Python Editor Script Plugin'."));
		}

		FPythonCommandEx Command;
		Command.Command = Code;
		Command.ExecutionMode = EPythonCommandExecutionMode::ExecuteFile;
		// Public scope keeps variables between calls, like a REPL.
		Command.FileExecutionScope = EPythonFileExecutionScope::Public;

		const bool bSuccess = Python->ExecPythonCommandEx(Command);

		FString Output;
		for (const FPythonLogOutputEntry& Entry : Command.LogOutput)
		{
			if (Entry.Type == EPythonLogOutputType::Error)
			{
				Output += TEXT("[error] ");
			}
			else if (Entry.Type == EPythonLogOutputType::Warning)
			{
				Output += TEXT("[warning] ");
			}
			Output += Entry.Output;
			Output += TEXT("\n");
		}
		if (!bSuccess && !Command.CommandResult.IsEmpty())
		{
			Output += Command.CommandResult;
		}
		if (Output.IsEmpty())
		{
			Output = bSuccess ? TEXT("(no output)") : TEXT("Python execution failed.");
		}
		return bSuccess ? FClaudeMCPToolResult::Ok(Output) : FClaudeMCPToolResult::Error(Output);
	}

	FClaudeMCPTool MakeTool(const TCHAR* Name, const TCHAR* Description, const TCHAR* Schema,
		FClaudeMCPToolResult (*Execute)(const TSharedPtr<FJsonObject>&))
	{
		FClaudeMCPTool Tool;
		Tool.Name = Name;
		Tool.Description = Description;
		Tool.InputSchema = ParseSchema(Schema);
		Tool.Execute = Execute;
		return Tool;
	}
}

TArray<FClaudeMCPTool> ClaudeMCPTools::CreateTools()
{
	const UClaudeMCPSettings* Settings = GetDefault<UClaudeMCPSettings>();
	TArray<FClaudeMCPTool> Tools;

	Tools.Add(MakeTool(TEXT("get_level_info"),
		TEXT("Engine version, the open map, actor count, whether Play-In-Editor is running, and the currently selected actors."),
		TEXT(R"({"type":"object","properties":{}})"),
		&GetLevelInfo));

	Tools.Add(MakeTool(TEXT("list_actors"),
		TEXT("List actors in the editor level with label, class, folder and transform. Filters are case-insensitive substrings."),
		TEXT(R"({"type":"object","properties":{
			"class_filter":{"type":"string","description":"e.g. 'Light' or 'StaticMeshActor'"},
			"name_filter":{"type":"string","description":"Substring of the actor label or name"},
			"limit":{"type":"integer","default":200}}})"),
		&ListActors));

	Tools.Add(MakeTool(TEXT("spawn_actor"),
		TEXT("Spawn an actor in the editor level (undoable). 'class' is a native class name ('PointLight', 'CameraActor'), a class/Blueprint path ('/Game/BP_Door.BP_Door_C'), or a basic shape: Cube, Sphere, Cylinder, Cone, Plane."),
		TEXT(R"({"type":"object","required":["class"],"properties":{
			"class":{"type":"string"},
			"label":{"type":"string","description":"Outliner label"},
			"location":{"type":"array","items":{"type":"number"},"minItems":3,"maxItems":3,"description":"[x, y, z] in cm"},
			"rotation":{"type":"array","items":{"type":"number"},"minItems":3,"maxItems":3,"description":"[pitch, yaw, roll] in degrees"},
			"scale":{"type":"array","items":{"type":"number"},"minItems":3,"maxItems":3},
			"static_mesh":{"type":"string","description":"Static mesh asset path for StaticMeshActor, e.g. /Game/Meshes/SM_Rock.SM_Rock"}}})"),
		&SpawnActor));

	Tools.Add(MakeTool(TEXT("delete_actors"),
		TEXT("Delete actors from the editor level by label (undoable)."),
		TEXT(R"({"type":"object","required":["labels"],"properties":{
			"labels":{"type":"array","items":{"type":"string"}}}})"),
		&DeleteActors));

	Tools.Add(MakeTool(TEXT("set_actor_transform"),
		TEXT("Move, rotate and/or scale an actor by label (undoable). Omitted fields are left unchanged."),
		TEXT(R"({"type":"object","required":["label"],"properties":{
			"label":{"type":"string"},
			"location":{"type":"array","items":{"type":"number"},"minItems":3,"maxItems":3},
			"rotation":{"type":"array","items":{"type":"number"},"minItems":3,"maxItems":3},
			"scale":{"type":"array","items":{"type":"number"},"minItems":3,"maxItems":3}}})"),
		&SetActorTransform));

	Tools.Add(MakeTool(TEXT("find_assets"),
		TEXT("Search the Content Browser (asset registry). Returns asset name, class and object path."),
		TEXT(R"({"type":"object","properties":{
			"path":{"type":"string","default":"/Game","description":"Content folder to search recursively"},
			"class_filter":{"type":"string","description":"e.g. 'StaticMesh', 'Material', 'Blueprint'"},
			"name_filter":{"type":"string"},
			"limit":{"type":"integer","default":200}}})"),
		&FindAssets));

	if (Settings->bAllowConsoleCommands)
	{
		Tools.Add(MakeTool(TEXT("run_console_command"),
			TEXT("Run an Unreal console command in the editor (e.g. 'stat fps', 'r.ScreenPercentage 75', 'HighResShot 2')."),
			TEXT(R"({"type":"object","required":["command"],"properties":{"command":{"type":"string"}}})"),
			&RunConsoleCommand));
	}

	if (Settings->bAllowPython)
	{
		Tools.Add(MakeTool(TEXT("execute_python"),
			TEXT("Run Python inside the editor with full access to the 'unreal' module (assets, materials, Blueprints, levels, sequencer, editor utilities). print() output is returned. Variables persist between calls."),
			TEXT(R"({"type":"object","required":["code"],"properties":{"code":{"type":"string","description":"Python source; may span multiple lines"}}})"),
			&ExecutePython));
	}

	return Tools;
}

#undef LOCTEXT_NAMESPACE
