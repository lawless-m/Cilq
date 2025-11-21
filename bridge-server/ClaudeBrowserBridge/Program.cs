using System.Net;
using ClaudeBrowserBridge.Models;
using ClaudeBrowserBridge.Services;

var builder = WebApplication.CreateBuilder(args);

// Add Windows Service support
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "ClaudeBrowserBridge";
});

// Configure Kestrel to listen on the specified port
var config = builder.Configuration.GetSection("BridgeServer").Get<BridgeServerConfig>()
    ?? new BridgeServerConfig();

builder.WebHost.ConfigureKestrel(options =>
{
    options.Listen(IPAddress.Loopback, config.Port);
});

// Add services
builder.Services.AddSingleton<WebSocketConnectionManager>();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

// Configure CORS for browser extensions
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(origin =>
        {
            // Allow any chrome-extension:// or extension:// origin
            return origin.StartsWith("chrome-extension://") ||
                   origin.StartsWith("extension://") ||
                   origin == "http://localhost" ||
                   origin.StartsWith("http://localhost:");
        })
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

// Enable WebSocket support
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(120)
});

// WebSocket endpoint
app.Map("/ws", async context =>
{
    if (context.WebSockets.IsWebSocketRequest)
    {
        var connectionId = context.Request.Query["connectionId"].ToString();
        if (string.IsNullOrEmpty(connectionId))
        {
            connectionId = Guid.NewGuid().ToString();
        }

        var webSocket = await context.WebSockets.AcceptWebSocketAsync();
        var connectionManager = context.RequestServices.GetRequiredService<WebSocketConnectionManager>();

        await connectionManager.HandleWebSocketAsync(webSocket, connectionId);
    }
    else
    {
        context.Response.StatusCode = 400;
    }
});

app.MapControllers();

// Simple root endpoint
app.MapGet("/", () => new
{
    service = "Claude Browser Bridge",
    version = "1.0.0",
    status = "running",
    websocket = "/ws",
    api = "/api/browser"
});

app.Logger.LogInformation("Claude Browser Bridge starting on http://localhost:{Port}", config.Port);
app.Logger.LogInformation("WebSocket endpoint: ws://localhost:{Port}/ws", config.Port);
app.Logger.LogInformation("HTTP API endpoint: http://localhost:{Port}/api/browser", config.Port);

app.Run();
