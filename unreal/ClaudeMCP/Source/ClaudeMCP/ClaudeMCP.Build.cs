using UnrealBuildTool;

public class ClaudeMCP : ModuleRules
{
	public ClaudeMCP(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"DeveloperSettings",
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"UnrealEd",
			"HTTPServer",
			"Json",
			"AssetRegistry",
			"PythonScriptPlugin",
		});
	}
}
