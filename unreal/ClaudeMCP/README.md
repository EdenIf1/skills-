# Claude MCP for Unreal Editor

An Unreal Engine 5 editor plugin that runs an [MCP](https://modelcontextprotocol.io) server inside the editor, so Claude Code (or any MCP client) can inspect and edit the open level.

- Endpoint: `http://127.0.0.1:8765/mcp` (Streamable HTTP, JSON responses)
- Engine: UE 5.3 or newer
- Source-only C++ plugin: the editor compiles it on first launch

## Tools

| Tool | What it does |
| --- | --- |
| `get_level_info` | Engine version, open map, actor count, PIE state, selected actors |
| `list_actors` | Actors with label, class, folder and transform; filter by class or name |
| `spawn_actor` | Spawn a native class, a Blueprint, or a basic shape (`Cube`, `Sphere`, …) |
| `delete_actors` | Delete actors by label |
| `set_actor_transform` | Move, rotate or scale an actor |
| `find_assets` | Search the Content Browser |
| `run_console_command` | Run any console command |
| `execute_python` | Run Python with the full `unreal` API (assets, materials, Blueprints, Sequencer, …) |

You can undo `spawn_actor`, `delete_actors` and `set_actor_transform` with Ctrl+Z.

## Install

1. Copy the `ClaudeMCP` folder into your project's `Plugins` folder:
   ```
   MyProject/
     MyProject.uproject
     Plugins/
       ClaudeMCP/
         ClaudeMCP.uplugin
         Source/...
   ```
2. You need a C++ toolchain: on Windows, Visual Studio 2022 with the "Game development with C++" workload; on macOS, Xcode.
   For a Blueprint-only project, the editor asks to rebuild the missing module the first time it opens. Click **Yes**.
   For a C++ project, right-click the `.uproject` file, choose **Generate Visual Studio project files**, then build.
3. Open the project. The plugin also turns on the **Python Editor Script Plugin**, which it depends on.
4. Check the Output Log for:
   ```
   LogClaudeMCP: MCP server listening on http://127.0.0.1:8765/mcp with 8 tools.
   ```

## Connect Claude Code

Keep the editor running, then on the same machine run:

```bash
claude mcp add --transport http unreal http://127.0.0.1:8765/mcp
claude mcp list   # should show "unreal ... connected"
```

If you set an auth token (see below), connect with:

```bash
claude mcp add --transport http unreal http://127.0.0.1:8765/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

To share the server with your team through the repo instead, put this in `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "unreal": { "type": "http", "url": "http://127.0.0.1:8765/mcp" }
  }
}
```

Then try asking Claude: *"List the lights in the level"*, *"Put a row of 10 cubes along the X axis, 200 units apart"*, or *"Find every material under /Game/Environment and set their roughness to 0.6"*.

## Settings

Go to **Edit → Editor Preferences → Plugins → Claude MCP**. Settings are saved per user and take effect after you restart the editor.

| Setting | Default | Notes |
| --- | --- | --- |
| Auto Start | on | |
| Port | 8765 | Change it if something else already uses the port |
| Localhost Only | on | Sets `[HTTPServer.Listeners] DefaultBindAddress=127.0.0.1` before the listener starts |
| Auth Token | empty | When set, requests need `Authorization: Bearer <token>` |
| Allow Python | on | Removes `execute_python` when off |
| Allow Console Commands | on | Removes `run_console_command` when off |

## Security

`execute_python` can do anything the editor can do, including reading files and running programs. The plugin limits who can reach it:

- The listener binds to 127.0.0.1, so other machines can't connect.
- Requests must use `localhost` or `127.0.0.1` as the Host and Origin. This blocks web pages from reaching the server through DNS rebinding.
- An auth token is optional. Set one if other people or programs share your machine.

If another plugin in the editor, such as Remote Control, starts its own HTTP listener after this one, that listener also binds to 127.0.0.1. Turn off **Localhost Only** if that is a problem. Then set an auth token, and allow the bind address you need in `DefaultEngine.ini` under `[HTTPServer.Listeners]`.

## Troubleshooting

- **No "listening" line in the log**: the port is taken. Change it in the settings and restart the editor.
- **Claude Code shows "failed to connect"**: the editor must be open, and Claude Code must run on the same machine.
- **`execute_python` says Python is unavailable**: enable **Python Editor Script Plugin** under Edit → Plugins.
- **Build errors on an engine version older than 5.3**: this plugin uses APIs added in 5.1–5.3 (`FAssetData::AssetClassPath`, `UClass::TryFindTypeSlow`). Upgrade the engine, or open an issue with the compiler output.
