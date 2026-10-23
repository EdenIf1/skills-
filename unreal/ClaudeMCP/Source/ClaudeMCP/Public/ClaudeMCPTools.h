#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"

struct FClaudeMCPToolResult
{
	FString Text;
	bool bIsError = false;

	static FClaudeMCPToolResult Ok(const FString& InText)
	{
		FClaudeMCPToolResult Result;
		Result.Text = InText;
		return Result;
	}

	static FClaudeMCPToolResult Error(const FString& InText)
	{
		FClaudeMCPToolResult Result;
		Result.Text = InText;
		Result.bIsError = true;
		return Result;
	}
};

struct FClaudeMCPTool
{
	FString Name;
	FString Description;
	TSharedPtr<FJsonObject> InputSchema;
	TFunction<FClaudeMCPToolResult(const TSharedPtr<FJsonObject>& Args)> Execute;
};

namespace ClaudeMCPTools
{
	/** Builds the tool list, honouring the enable flags in UClaudeMCPSettings. */
	TArray<FClaudeMCPTool> CreateTools();
}
