namespace ClaudeBrowserBridge.Models;

public class BrowserMessage
{
    public string Type { get; set; } = string.Empty;
    public long Timestamp { get; set; }
    public string? TabId { get; set; }
    public object? Data { get; set; }
}

public class PageLoadMessage : BrowserMessage
{
    public string Url { get; set; } = string.Empty;
    public string? Dom { get; set; }
    public List<ConsoleEntry>? Console { get; set; }
    public List<ErrorEntry>? Errors { get; set; }
}

public class ConsoleEntry
{
    public string Level { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public long Timestamp { get; set; }
    public string? StackTrace { get; set; }
}

public class ErrorEntry
{
    public string Message { get; set; } = string.Empty;
    public string? StackTrace { get; set; }
    public long Timestamp { get; set; }
    public string? Source { get; set; }
    public int? LineNumber { get; set; }
    public int? ColumnNumber { get; set; }
}

public class ExecuteScriptMessage : BrowserMessage
{
    public string Script { get; set; } = string.Empty;
}

public class ScriptResultMessage : BrowserMessage
{
    public bool Success { get; set; }
    public object? Result { get; set; }
    public string? Error { get; set; }
}

public class InspectElementMessage : BrowserMessage
{
    public string Selector { get; set; } = string.Empty;
    public string? Html { get; set; }
    public Dictionary<string, string>? ComputedStyles { get; set; }
    public BoundingBox? BoundingBox { get; set; }
}

public class BoundingBox
{
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
}

public class NetworkRequestMessage : BrowserMessage
{
    public string Method { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public int StatusCode { get; set; }
    public Dictionary<string, string>? Headers { get; set; }
    public string? RequestBody { get; set; }
    public string? ResponseBody { get; set; }
    public long Duration { get; set; }
}
