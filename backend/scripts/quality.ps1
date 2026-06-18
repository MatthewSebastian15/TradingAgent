$ErrorActionPreference = "Stop"

function Invoke-Checked {
    & $args[0] @($args | Select-Object -Skip 1)
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

$BackendRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent $BackendRoot
Push-Location $RepoRoot
try {
    Invoke-Checked python -m ruff format --check backend packages
    Invoke-Checked python -m ruff check backend packages
    Invoke-Checked python -m pytest backend/tests packages/tests -q
}
finally {
    Pop-Location
}
