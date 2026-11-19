# Builds the single-file Supabase Edge Function from the shared core + the live adapter.
# Run:  powershell -ExecutionPolicy Bypass -File tools\build-function.ps1
# Output: supabase\functions\academy\index.ts  (paste it into Supabase → Edge Functions → academy)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

$core = [IO.File]::ReadAllText((Join-Path $root 'site\js\core.js'), $utf8)
$edgeLines = [IO.File]::ReadAllLines((Join-Path $root 'server\edge.js'), $utf8)

$imports = @(); $rest = @()
foreach ($l in $edgeLines) {
  if ($l -match "from '\.\./site/js/core\.js'") { continue }      # the core is pasted in below
  if ($l -match '^import ') { $imports += $l } else { $rest += $l }
}
if ($core -match '(?m)^import ') { throw 'core.js must not import anything (it is pasted into the function).' }

$out = New-Object System.Text.StringBuilder
[void]$out.AppendLine('// @ts-nocheck')
[void]$out.AppendLine('// GENERATED FILE - do not edit by hand. Built by tools/build-function.ps1')
[void]$out.AppendLine('// from site/js/core.js (shared rules) + server/edge.js (live adapter).')
foreach ($l in $imports) { [void]$out.AppendLine($l) }
[void]$out.AppendLine('')
[void]$out.AppendLine('// ======================================================== site/js/core.js')
[void]$out.AppendLine($core)
[void]$out.AppendLine('// ======================================================== server/edge.js')
foreach ($l in $rest) { [void]$out.AppendLine($l) }

$dir = Join-Path $root 'supabase\functions\academy'
New-Item -ItemType Directory -Force $dir | Out-Null
$target = Join-Path $dir 'index.ts'
[IO.File]::WriteAllText($target, $out.ToString(), $utf8)

# Safety check: no secrets or keys may ever end up in the built file.
$built = $out.ToString()
foreach ($bad in @('sb_secret_', 'service_role"', 'eyJhbGci')) {
  if ($built.Contains($bad)) { throw "Refusing: built file contains '$bad'" }
}
"Built $target ($([Math]::Round($built.Length / 1024)) KB)"
