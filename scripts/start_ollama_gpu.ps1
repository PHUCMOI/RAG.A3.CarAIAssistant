param(
    [string]$ModelsPath = (Join-Path $PSScriptRoot '..\.local\ollama'),
    [string]$ContainerName = 'autowise-ollama-gpu',
    [int]$Port = 11435
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath (Join-Path $ModelsPath 'models') -PathType Container)) {
    throw "Model directory missing: $ModelsPath\models. Use the existing Ollama model directory."
}
$resolvedModelsPath = (Resolve-Path -LiteralPath $ModelsPath).Path
$existingNames = docker ps -a --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is unavailable.' }
if ($existingNames -contains $ContainerName) {
    throw "Container $ContainerName already exists. Inspect it with docker inspect; this script does not replace containers."
}
docker image inspect ollama/ollama:latest --format '{{.Id}}'
if ($LASTEXITCODE -ne 0) { throw 'The existing ollama/ollama:latest image is missing; no download was attempted.' }

# A separate port preserves existing providers. Reuse the configured model files.
docker run -d --pull never --gpus all --name $ContainerName `
    -p "127.0.0.1:${Port}:11434" `
    --mount "type=bind,source=$resolvedModelsPath,target=/root/.ollama" `
    -e OLLAMA_KEEP_ALIVE=15m -e OLLAMA_NUM_PARALLEL=1 `
    ollama/ollama:latest
if ($LASTEXITCODE -ne 0) { throw 'GPU container startup failed. Check Docker Desktop WSL2 and NVIDIA driver support.' }

Write-Host "Created $ContainerName using existing models. Set OLLAMA_URL=http://localhost:$Port in .env and restart the backend."
Write-Host "After a chat request, verify GPU usage: docker exec $ContainerName ollama ps"
Write-Host 'Expected PROCESSOR: 100% GPU. For startup failures, inspect docker logs.'
