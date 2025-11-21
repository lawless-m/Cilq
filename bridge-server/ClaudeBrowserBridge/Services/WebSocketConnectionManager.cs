using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using ClaudeBrowserBridge.Models;

namespace ClaudeBrowserBridge.Services;

public class WebSocketConnectionManager
{
    private readonly ConcurrentDictionary<string, WebSocketConnection> _connections = new();
    private readonly ILogger<WebSocketConnectionManager> _logger;

    public WebSocketConnectionManager(ILogger<WebSocketConnectionManager> logger)
    {
        _logger = logger;
    }

    public async Task HandleWebSocketAsync(WebSocket webSocket, string connectionId)
    {
        var connection = new WebSocketConnection(connectionId, webSocket);
        _connections.TryAdd(connectionId, connection);

        _logger.LogInformation("WebSocket connection established: {ConnectionId}", connectionId);

        try
        {
            await ReceiveMessagesAsync(connection);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling WebSocket for connection: {ConnectionId}", connectionId);
        }
        finally
        {
            _connections.TryRemove(connectionId, out _);
            await connection.CloseAsync();
            _logger.LogInformation("WebSocket connection closed: {ConnectionId}", connectionId);
        }
    }

    private async Task ReceiveMessagesAsync(WebSocketConnection connection)
    {
        var buffer = new byte[1024 * 4];
        var messageBuilder = new StringBuilder();

        while (connection.WebSocket.State == WebSocketState.Open)
        {
            WebSocketReceiveResult result;

            do
            {
                result = await connection.WebSocket.ReceiveAsync(
                    new ArraySegment<byte>(buffer),
                    CancellationToken.None);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await connection.WebSocket.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        "Closing",
                        CancellationToken.None);
                    return;
                }

                var text = Encoding.UTF8.GetString(buffer, 0, result.Count);
                messageBuilder.Append(text);

            } while (!result.EndOfMessage);

            var message = messageBuilder.ToString();
            messageBuilder.Clear();

            if (!string.IsNullOrEmpty(message))
            {
                await ProcessMessageAsync(connection, message);
            }
        }
    }

    private async Task ProcessMessageAsync(WebSocketConnection connection, string messageJson)
    {
        try
        {
            var message = JsonSerializer.Deserialize<BrowserMessage>(messageJson);

            if (message == null)
            {
                _logger.LogWarning("Received null message from {ConnectionId}", connection.ConnectionId);
                return;
            }

            _logger.LogInformation("Received message type: {Type} from {ConnectionId}",
                message.Type, connection.ConnectionId);

            connection.LastMessage = message;
            connection.LastMessageTime = DateTime.UtcNow;

            // Store message in connection history
            connection.MessageHistory.Add(message);

            // Broadcast to other services if needed
            await Task.CompletedTask;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialize message from {ConnectionId}", connection.ConnectionId);
        }
    }

    public async Task SendMessageAsync(string connectionId, object message)
    {
        if (_connections.TryGetValue(connectionId, out var connection))
        {
            await SendMessageAsync(connection, message);
        }
        else
        {
            _logger.LogWarning("Connection not found: {ConnectionId}", connectionId);
        }
    }

    public async Task BroadcastMessageAsync(object message)
    {
        var tasks = _connections.Values.Select(conn => SendMessageAsync(conn, message));
        await Task.WhenAll(tasks);
    }

    private async Task SendMessageAsync(WebSocketConnection connection, object message)
    {
        if (connection.WebSocket.State != WebSocketState.Open)
        {
            return;
        }

        try
        {
            var json = JsonSerializer.Serialize(message);
            var bytes = Encoding.UTF8.GetBytes(json);

            await connection.WebSocket.SendAsync(
                new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text,
                true,
                CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send message to {ConnectionId}", connection.ConnectionId);
        }
    }

    public IEnumerable<WebSocketConnection> GetAllConnections()
    {
        return _connections.Values;
    }

    public WebSocketConnection? GetConnection(string connectionId)
    {
        _connections.TryGetValue(connectionId, out var connection);
        return connection;
    }
}

public class WebSocketConnection
{
    public string ConnectionId { get; }
    public WebSocket WebSocket { get; }
    public DateTime ConnectedAt { get; }
    public DateTime LastMessageTime { get; set; }
    public BrowserMessage? LastMessage { get; set; }
    public List<BrowserMessage> MessageHistory { get; } = new();

    public WebSocketConnection(string connectionId, WebSocket webSocket)
    {
        ConnectionId = connectionId;
        WebSocket = webSocket;
        ConnectedAt = DateTime.UtcNow;
        LastMessageTime = DateTime.UtcNow;
    }

    public async Task CloseAsync()
    {
        if (WebSocket.State == WebSocketState.Open)
        {
            await WebSocket.CloseAsync(
                WebSocketCloseStatus.NormalClosure,
                "Connection closed",
                CancellationToken.None);
        }

        WebSocket.Dispose();
    }
}
