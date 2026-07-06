using System;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;

var jsonPath = @"C:\RI Services\BrowserBridge\claude_browser_last_result.json";
var category = args.Length > 0 ? args[0] : "elements";
var outputDir = Path.Combine(@"C:\RI Services\BrowserBridge\images", category);

Directory.CreateDirectory(outputDir);

var json = File.ReadAllText(jsonPath);
var doc = JsonDocument.Parse(json);

var result = doc.RootElement.GetProperty("result");

if (result.ValueKind == JsonValueKind.Array)
{
    int index = 0;
    foreach (var item in result.EnumerateArray())
    {
        var src = item.GetProperty("src").GetString();
        var alt = item.TryGetProperty("alt", out var altProp) ? altProp.GetString() : null;
        var title = item.TryGetProperty("title", out var titleProp) ? titleProp.GetString() : null;

        if (string.IsNullOrEmpty(src) || !src.StartsWith("data:image/"))
        {
            continue;
        }

        // Extract base64 data
        var match = Regex.Match(src, @"data:image/(\w+);base64,(.+)");
        if (!match.Success)
        {
            continue;
        }

        var extension = match.Groups[1].Value;
        var base64Data = match.Groups[2].Value;
        var imageBytes = Convert.FromBase64String(base64Data);

        // Create filename from alt text or use index
        var filename = !string.IsNullOrEmpty(alt)
            ? SanitizeFilename(alt)
            : !string.IsNullOrEmpty(title)
                ? SanitizeFilename(title)
                : $"image_{index:D3}";

        var filepath = Path.Combine(outputDir, $"{filename}.{extension}");

        // Handle duplicate filenames
        int counter = 1;
        while (File.Exists(filepath))
        {
            filepath = Path.Combine(outputDir, $"{filename}_{counter}.{extension}");
            counter++;
        }

        File.WriteAllBytes(filepath, imageBytes);
        Console.WriteLine($"Saved: {filepath} ({alt ?? "no alt"})");

        index++;
    }

    Console.WriteLine($"\nTotal images saved: {index}");
}

static string SanitizeFilename(string filename)
{
    // Remove invalid filename characters
    var invalid = Path.GetInvalidFileNameChars();
    var sanitized = string.Join("_", filename.Split(invalid, StringSplitOptions.RemoveEmptyEntries));

    // Limit length
    if (sanitized.Length > 100)
    {
        sanitized = sanitized.Substring(0, 100);
    }

    return sanitized.Trim();
}
