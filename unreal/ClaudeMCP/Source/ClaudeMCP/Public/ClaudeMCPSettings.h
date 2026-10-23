#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "ClaudeMCPSettings.generated.h"

/**
 * Editor Preferences > Plugins > Claude MCP.
 * Stored per user, so tokens never end up in source control.
 * Changes take effect after restarting the editor.
 */
UCLASS(config = EditorPerProjectUserSettings, meta = (DisplayName = "Claude MCP"))
class UClaudeMCPSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UClaudeMCPSettings()
	{
		CategoryName = TEXT("Plugins");
	}

	/** Start the MCP server when the editor launches. */
	UPROPERTY(config, EditAnywhere, Category = "Server")
	bool bAutoStart = true;

	/** Port for the MCP endpoint (http://127.0.0.1:<Port>/mcp). */
	UPROPERTY(config, EditAnywhere, Category = "Server", meta = (ClampMin = 1024, ClampMax = 65535))
	int32 Port = 8765;

	/** Bind the editor's HTTP server to 127.0.0.1 so other machines on the network cannot connect. */
	UPROPERTY(config, EditAnywhere, Category = "Security")
	bool bLocalhostOnly = true;

	/** Optional. When set, clients must send "Authorization: Bearer <token>". */
	UPROPERTY(config, EditAnywhere, Category = "Security", meta = (PasswordField = true))
	FString AuthToken;

	/** Expose the execute_python tool (arbitrary Python in the editor). */
	UPROPERTY(config, EditAnywhere, Category = "Tools")
	bool bAllowPython = true;

	/** Expose the run_console_command tool. */
	UPROPERTY(config, EditAnywhere, Category = "Tools")
	bool bAllowConsoleCommands = true;
};
