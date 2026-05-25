$ErrorActionPreference = "Stop"

function Invoke-Checked {
    & $args[0] @($args | Select-Object -Skip 1)
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

$BackendRoot = Split-Path -Parent $PSScriptRoot
Push-Location $BackendRoot
try {
    Invoke-Checked python -m ruff format --check .
    Invoke-Checked python -m ruff check .
    Invoke-Checked python -m pytest tests -q
}
finally {
    Pop-Location
}
