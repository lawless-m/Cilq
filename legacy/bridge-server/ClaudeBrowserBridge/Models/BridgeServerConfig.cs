namespace ClaudeBrowserBridge.Models;

public class BridgeServerConfig
{
    public int Port { get; set; } = 3141;
    public List<string> AllowedOrigins { get; set; } = new();
    public int MaxConnections { get; set; } = 10;
}
