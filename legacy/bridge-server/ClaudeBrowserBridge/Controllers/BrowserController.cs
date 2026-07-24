using Microsoft.AspNetCore.Mvc;
using ClaudeBrowserBridge.Models;
using ClaudeBrowserBridge.Services;

namespace ClaudeBrowserBridge.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BrowserController : ControllerBase
{
    private readonly WebSocketConnectionManager _connectionManager;
    private readonly ILogger<BrowserController> _logger;

    public BrowserController(
        WebSocketConnectionManager connectionManager,
        ILogger<BrowserController> logger)
    {
        _connectionManager = connectionManager;
        _logger = logger;
    }

    [HttpGet("connections")]
    public IActionResult GetConnections()
    {
        var connections = _connectionManager.GetAllConnections()
            .Select(c => new
            {
                connectionId = c.ConnectionId,
                connectedAt = c.ConnectedAt,
                lastMessageTime = c.LastMessageTime,
                messageCount = c.MessageHistory.Count,
                lastMessageType = c.LastMessage?.Type
            });

        return Ok(connections);
    }

    [HttpGet("connections/{connectionId}")]
    public IActionResult GetConnection(string connectionId)
    {
        var connection = _connectionManager.GetConnection(connectionId);

        if (connection == null)
        {
            return NotFound(new { error = $"Connection {connectionId} not found" });
        }

        return Ok(new
        {
            connectionId = connection.ConnectionId,
            connectedAt = connection.ConnectedAt,
            lastMessageTime = connection.LastMessageTime,
            messageCount = connection.MessageHistory.Count,
            lastMessage = connection.LastMessage
        });
    }

    [HttpGet("connections/{connectionId}/history")]
    public IActionResult GetMessageHistory(string connectionId, [FromQuery] int limit = 50)
    {
        var connection = _connectionManager.GetConnection(connectionId);

        if (connection == null)
        {
            return NotFound(new { error = $"Connection {connectionId} not found" });
        }

        var history = connection.MessageHistory
            .TakeLast(limit)
            .ToList();

        return Ok(history);
    }

    [HttpPost("execute")]
    public async Task<IActionResult> ExecuteScript([FromBody] ExecuteScriptRequest request)
    {
        if (string.IsNullOrEmpty(request.Script))
        {
            return BadRequest(new { error = "Script is required" });
        }

        var message = new ExecuteScriptMessage
        {
            Type = "execute_script",
            Script = request.Script,
            TabId = request.TabId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        if (!string.IsNullOrEmpty(request.ConnectionId))
        {
            await _connectionManager.SendMessageAsync(request.ConnectionId, message);
        }
        else
        {
            await _connectionManager.BroadcastMessageAsync(message);
        }

        return Accepted(new { message = "Script execution request sent", requestId = Guid.NewGuid() });
    }

    [HttpPost("inspect")]
    public async Task<IActionResult> InspectElement([FromBody] InspectRequest request)
    {
        if (string.IsNullOrEmpty(request.Selector))
        {
            return BadRequest(new { error = "Selector is required" });
        }

        var message = new
        {
            type = "inspect_element",
            selector = request.Selector,
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        if (!string.IsNullOrEmpty(request.ConnectionId))
        {
            await _connectionManager.SendMessageAsync(request.ConnectionId, message);
        }
        else
        {
            await _connectionManager.BroadcastMessageAsync(message);
        }

        return Accepted(new { message = "Inspection request sent", requestId = Guid.NewGuid() });
    }

    [HttpPost("screenshot")]
    public async Task<IActionResult> TakeScreenshot([FromBody] ScreenshotRequest request)
    {
        var message = new
        {
            type = "take_screenshot",
            selector = request.Selector,
            fullPage = request.FullPage,
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        if (!string.IsNullOrEmpty(request.ConnectionId))
        {
            await _connectionManager.SendMessageAsync(request.ConnectionId, message);
        }
        else
        {
            await _connectionManager.BroadcastMessageAsync(message);
        }

        return Accepted(new { message = "Screenshot request sent", requestId = Guid.NewGuid() });
    }

    [HttpGet("health")]
    public IActionResult Health()
    {
        var connectionCount = _connectionManager.GetAllConnections().Count();

        return Ok(new
        {
            status = "healthy",
            timestamp = DateTime.UtcNow,
            connections = connectionCount
        });
    }

    [HttpPost("execute-sync")]
    public async Task<IActionResult> ExecuteScriptSync([FromBody] ExecuteScriptRequest request, [FromQuery] int timeout = 10000)
    {
        if (string.IsNullOrEmpty(request.Script))
        {
            return BadRequest(new { error = "Script is required" });
        }

        var message = new ExecuteScriptMessage
        {
            Type = "execute_script",
            Script = request.Script,
            TabId = request.TabId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        string connectionId = request.ConnectionId;
        if (string.IsNullOrEmpty(connectionId))
        {
            // Get first available connection
            var firstConnection = _connectionManager.GetAllConnections().FirstOrDefault();
            if (firstConnection == null)
            {
                return NotFound(new { error = "No browser connections available" });
            }
            connectionId = firstConnection.ConnectionId;
        }

        var connection = _connectionManager.GetConnection(connectionId);
        if (connection == null)
        {
            return NotFound(new { error = $"Connection {connectionId} not found" });
        }

        var initialMessageCount = connection.MessageHistory.Count;

        // Send the message
        await _connectionManager.SendMessageAsync(connectionId, message);

        // Wait for response with timeout
        var startTime = DateTime.UtcNow;
        while ((DateTime.UtcNow - startTime).TotalMilliseconds < timeout)
        {
            await Task.Delay(100);

            // Check if we received a new message
            if (connection.MessageHistory.Count > initialMessageCount)
            {
                var latestMessage = connection.MessageHistory.LastOrDefault();
                if (latestMessage != null && latestMessage.Type == "script_result")
                {
                    return Ok(new
                    {
                        success = true,
                        message = latestMessage,
                        data = latestMessage.Data
                    });
                }
            }
        }

        return StatusCode(408, new { error = "Script execution timed out" });
    }
}

public class ExecuteScriptRequest
{
    public string Script { get; set; } = string.Empty;
    public string? TabId { get; set; }
    public string? ConnectionId { get; set; }
}

public class InspectRequest
{
    public string Selector { get; set; } = string.Empty;
    public string? ConnectionId { get; set; }
}

public class ScreenshotRequest
{
    public string? Selector { get; set; }
    public bool FullPage { get; set; } = false;
    public string? ConnectionId { get; set; }
}
