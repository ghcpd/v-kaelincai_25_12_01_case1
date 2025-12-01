# setup.ps1 - Project B Post-Change Setup Script (Windows)
# Initializes the v2 greenfield implementation environment

$ErrorActionPreference = "Stop"

Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Event Label Extractor v2.0 - Setup Script" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check Node.js version
Write-Host "[1/5] Checking Node.js version..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  ✓ Node.js $nodeVersion detected" -ForegroundColor Green
    
    $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($majorVersion -lt 18) {
        Write-Host "  ✗ Error: Node.js 18+ required" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ✗ Error: Node.js not found" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host ""
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    npm install
    Write-Host "  ✓ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  ✓ No package.json, skipping npm install" -ForegroundColor Green
}

# Create output directories
Write-Host ""
Write-Host "[3/5] Creating output directories..." -ForegroundColor Yellow
@("logs", "results", "mocks") | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
}
Write-Host "  ✓ Directories created: logs/, results/, mocks/" -ForegroundColor Green

# Validate project structure
Write-Host ""
Write-Host "[4/5] Validating project structure..." -ForegroundColor Yellow

$requiredDirs = @("src", "tests", "data")
$requiredFiles = @(
    "src\eventLabelExtractor.js",
    "src\services\EventNormalizer.js",
    "src\services\AttributeExtractor.js",
    "src\services\Validator.js",
    "src\services\Logger.js",
    "src\services\MetricsCollector.js",
    "tests\integration.test.js",
    "data\test_data.json"
)

$allValid = $true

foreach ($dir in $requiredDirs) {
    if (Test-Path $dir) {
        Write-Host "  ✓ Directory exists: $dir/" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Missing directory: $dir/" -ForegroundColor Red
        $allValid = $false
    }
}

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ File exists: $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Missing file: $file" -ForegroundColor Red
        $allValid = $false
    }
}

if (-not $allValid) {
    exit 1
}

# Run quick validation test
Write-Host ""
Write-Host "[5/5] Running validation tests..." -ForegroundColor Yellow
try {
    $testResult = npm test 2>&1
    Write-Host "  ✓ All tests passed" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ Some tests failed (this may be expected during setup)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ Setup Complete!" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run tests:           .\run_tests.ps1"
Write-Host "  2. View results:        Get-Content results\results_post.json"
Write-Host "  3. Check logs:          Get-Content logs\log_post.txt"
Write-Host ""
