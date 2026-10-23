#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleInterface.h"
#include "HttpResultCallback.h"
#include "HttpRouteHandle.h"
#include "HttpServerConstants.h"
#include "ClaudeMCPTools.h"

class IHttpRouter;
class FJsonObject;
struct FHttpServerRequest;

class FClaudeMCPModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

private:
	void StartServer();
	void StopServer();

	bool HandleRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete);
	bool IsRequestAllowed(const FHttpServerRequest& Request, EHttpServerResponseCodes& OutStatus, FString& OutReason) const;
	TSharedPtr<FJsonObject> HandleRpc(const FJsonObject& Message);
	TSharedPtr<FJsonObject> HandleInitialize(const FJsonObject& Params) const;
	TSharedPtr<FJsonObject> HandleToolsList() const;

	TSharedPtr<IHttpRouter> Router;
	FHttpRouteHandle RouteHandle;
	TArray<FClaudeMCPTool> Tools;
};
