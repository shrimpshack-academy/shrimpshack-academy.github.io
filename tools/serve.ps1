param([int]$Port = 8765, [string]$Root = (Join-Path $PSScriptRoot '..'))
# Tiny local static file server for previewing the site (localhost only).
$Root = (Resolve-Path $Root).Path
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json'; '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.pdf'='application/pdf'; '.webmanifest'='application/manifest+json'; '.csv'='text/csv; charset=utf-8' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $Root on http://localhost:$Port/"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
    $path = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
    if (-not $path.StartsWith($Root) -or -not (Test-Path $path -PathType Leaf)) {
      $ctx.Response.StatusCode = 404; $b = [Text.Encoding]::UTF8.GetBytes('Not found')
    } else {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $ctx.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $b = [IO.File]::ReadAllBytes($path)
    }
    $ctx.Response.OutputStream.Write($b, 0, $b.Length)
  } catch { } finally { $ctx.Response.Close() }
}
