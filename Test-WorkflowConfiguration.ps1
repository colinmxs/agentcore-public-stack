# Test script for GitHub Actions workflow configuration (Task 15.6)
# Validates Requirements: 9.1, 9.2, 9.3, 9.4

$ErrorActionPreference = "Stop"

# Test counters
$script:TestsPassed = 0
$script:TestsFailed = 0
$script:TestsTotal = 0
$script:FailedTests = @()

# Helper functions
function Log-Test {
    param([string]$Message)
    Write-Host "`nTEST: $Message" -ForegroundColor Yellow
    $script:TestsTotal++
}

function Log-Pass {
    param([string]$Message)
    Write-Host "[PASS] $Message" -ForegroundColor Green
    $script:TestsPassed++
}

function Log-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    $script:TestsFailed++
    $script:FailedTests += $Message
}

function Log-Info {
    param([string]$Message)
    Write-Host "  INFO: $Message"
}

# Workflow files to test
$workflows = @(
    ".github/workflows/infrastructure.yml",
    ".github/workflows/app-api.yml",
    ".github/workflows/inference-api.yml",
    ".github/workflows/frontend.yml",
    ".github/workflows/gateway.yml"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "GitHub Actions Workflow Configuration Test" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Testing environment-agnostic refactor requirements:"
Write-Host "  - Requirement 9.1: GitHub Environments support"
Write-Host "  - Requirement 9.2: Variable/secret loading from environments"
Write-Host "  - Requirement 9.3: Manual environment selection (workflow_dispatch)"
Write-Host "  - Requirement 9.4: Automatic environment selection (branch-based)"
Write-Host ""

# Test 1: Verify workflow files exist
Log-Test "Workflow files exist"
$allExist = $true
foreach ($workflow in $workflows) {
    if (Test-Path $workflow) {
        Log-Info "Found: $workflow"
    } else {
        Log-Info "Missing: $workflow"
        $allExist = $false
    }
}

if ($allExist) {
    Log-Pass "All workflow files exist"
} else {
    Log-Fail "Some workflow files are missing"
}

# Test 2: Verify workflow_dispatch with environment input (Requirement 9.3)
Log-Test "Workflows have workflow_dispatch with environment selection"
$allHaveDispatch = $true
foreach ($workflow in $workflows) {
    if (-not (Test-Path $workflow)) {
        continue
    }
    
    $workflowName = Split-Path $workflow -Leaf
    $content = Get-Content $workflow -Raw
    
    # Check for workflow_dispatch trigger
    if ($content -match "workflow_dispatch:") {
        # Check for environment input with choice type
        if ($content -match "environment:" -and 
            $content -match "type: choice" -and 
            $content -match "development" -and 
            $content -match "production") {
            Log-Info "[OK] $workflowName has workflow_dispatch with environment choice"
        } else {
            Log-Fail "$workflowName : workflow_dispatch missing proper environment input"
            $allHaveDispatch = $false
        }
    } else {
        Log-Fail "$workflowName : Missing workflow_dispatch trigger"
        $allHaveDispatch = $false
    }
}
if ($allHaveDispatch) {
    Log-Pass "All workflows have workflow_dispatch with environment selection"
}

# Test 3: Verify environment key in jobs (Requirement 9.1)
Log-Test "Jobs reference GitHub Environments correctly"
$allHaveEnvironment = $true
foreach ($workflow in $workflows) {
    if (-not (Test-Path $workflow)) {
        continue
    }
    
    $workflowName = Split-Path $workflow -Leaf
    $content = Get-Content $workflow -Raw
    
    # Check for environment selection logic in jobs
    if ($content -match "environment: \$\{\{") {
        Log-Info "[OK] $workflowName has environment selection logic"
    } else {
        Log-Fail "$workflowName : Missing environment selection in jobs"
        $allHaveEnvironment = $false
    }
}
if ($allHaveEnvironment) {
    Log-Pass "All workflows reference GitHub Environments"
}

# Test 4: Verify automatic environment selection based on branch (Requirement 9.4)
Log-Test "Workflows have automatic environment selection based on branch"
$allHaveBranchSelection = $true
foreach ($workflow in $workflows) {
    if (-not (Test-Path $workflow)) {
        continue
    }
    
    $workflowName = Split-Path $workflow -Leaf
    $content = Get-Content $workflow -Raw
    
    # Check for branch-based environment selection
    if ($content -match "github\.ref == 'refs/heads/main'" -and 
        $content -match "'production'" -and 
        $content -match "github\.ref == 'refs/heads/develop'" -and 
        $content -match "'development'") {
        Log-Info "[OK] $workflowName has branch-based environment selection (main->production, develop->development)"
    } else {
        Log-Fail "$workflowName : Missing or incomplete branch-based environment selection"
        $allHaveBranchSelection = $false
    }
}
if ($allHaveBranchSelection) {
    Log-Pass "All workflows have automatic environment selection"
}

# Test 5: Verify GitHub Environment variables are referenced (Requirement 9.2)
Log-Test "Workflows reference GitHub Environment variables correctly"
$allHaveVars = $true
foreach ($workflow in $workflows) {
    if (-not (Test-Path $workflow)) {
        continue
    }
    
    $workflowName = Split-Path $workflow -Leaf
    $content = Get-Content $workflow -Raw
    
    # Check for vars. and secrets. references
    if ($content -match "\$\{\{ vars\." -and $content -match "\$\{\{ secrets\.") {
        Log-Info "[OK] $workflowName references GitHub Variables and Secrets"
    } else {
        Log-Fail "$workflowName : Missing GitHub Variables or Secrets references"
        $allHaveVars = $false
    }
    
    # Check for CDK_PROJECT_PREFIX
    if ($content -match "CDK_PROJECT_PREFIX: \`$\{\{ vars\.CDK_PROJECT_PREFIX \}\}") {
        Log-Info "[OK] $workflowName references CDK_PROJECT_PREFIX from vars"
    } else {
        Log-Fail "$workflowName : Missing CDK_PROJECT_PREFIX from GitHub Variables"
        $allHaveVars = $false
    }
    
    # Check for CDK_AWS_ACCOUNT
    if ($content -match "CDK_AWS_ACCOUNT: \`$\{\{ secrets\.CDK_AWS_ACCOUNT \}\}") {
        Log-Info "[OK] $workflowName references CDK_AWS_ACCOUNT from secrets"
    } else {
        Log-Fail "$workflowName : Missing CDK_AWS_ACCOUNT from GitHub Secrets"
        $allHaveVars = $false
    }
}
if ($allHaveVars) {
    Log-Pass "All workflows reference GitHub Environment variables"
}

# Test 6: Verify no DEPLOY_ENVIRONMENT references remain
Log-Test "No DEPLOY_ENVIRONMENT references in workflows"
$deployEnvFound = $false
foreach ($workflow in $workflows) {
    if (-not (Test-Path $workflow)) {
        continue
    }
    
    $workflowName = Split-Path $workflow -Leaf
    $content = Get-Content $workflow
    
    $matches = $content | Select-String "DEPLOY_ENVIRONMENT" -SimpleMatch
    if ($matches) {
        Log-Fail "$workflowName : Found DEPLOY_ENVIRONMENT reference (should be removed)"
        $deployEnvFound = $true
        Log-Info "Lines with DEPLOY_ENVIRONMENT:"
        foreach ($match in $matches) {
            Log-Info "  Line $($match.LineNumber): $($match.Line.Trim())"
        }
    }
}

if (-not $deployEnvFound) {
    Log-Pass "No DEPLOY_ENVIRONMENT references found in workflows"
} else {
    Log-Fail "DEPLOY_ENVIRONMENT references found (must be removed)"
}

# Test 7: Verify environment selection expression format
Log-Test "Environment selection expressions are correctly formatted"
$allExpressionsCorrect = $true
foreach ($workflow in $workflows) {
    if (-not (Test-Path $workflow)) {
        continue
    }
    
    $workflowName = Split-Path $workflow -Leaf
    $content = Get-Content $workflow -Raw
    
    # Check if expression includes all required parts
    if ($content -match "environment: \$\{\{") {
        if ($content -match "github\.event\.inputs\.environment" -and 
            $content -match "github\.ref == 'refs/heads/main'" -and 
            $content -match "'production'" -and 
            $content -match "github\.ref == 'refs/heads/develop'" -and 
            $content -match "'development'") {
            Log-Info "[OK] $workflowName has complete environment selection expression"
        } else {
            Log-Fail "$workflowName : Incomplete environment selection expression"
            $allExpressionsCorrect = $false
        }
    }
}
if ($allExpressionsCorrect) {
    Log-Pass "Environment selection expressions are correctly formatted"
}

# Test 8: Verify deployment summary includes environment
Log-Test "Deployment summaries include environment information"
$allHaveSummary = $true
foreach ($workflow in $workflows) {
    if (-not (Test-Path $workflow)) {
        continue
    }
    
    $workflowName = Split-Path $workflow -Leaf
    $content = Get-Content $workflow -Raw
    
    # Check if deployment summary exists and includes ENVIRONMENT variable
    if ($content -match "[Dd]eployment summary") {
        if ($content -match "ENVIRONMENT=") {
            Log-Info "[OK] $workflowName deployment summary includes environment"
        } else {
            Log-Fail "$workflowName : Deployment summary missing environment variable"
            $allHaveSummary = $false
        }
    }
}
if ($allHaveSummary) {
    Log-Pass "Deployment summaries include environment information"
}

# Test 9: Verify environment-specific variables are used correctly
Log-Test "Environment-specific configuration variables are properly referenced"
$allVarsCorrect = $true
foreach ($workflow in $workflows) {
    if (-not (Test-Path $workflow)) {
        continue
    }
    
    $workflowName = Split-Path $workflow -Leaf
    $content = Get-Content $workflow -Raw
    
    # Check CDK_RETAIN_DATA_ON_DELETE is from vars
    if ($content -match "CDK_RETAIN_DATA_ON_DELETE") {
        if ($content -match "CDK_RETAIN_DATA_ON_DELETE: \`$\{\{ vars\.CDK_RETAIN_DATA_ON_DELETE \}\}") {
            Log-Info "[OK] $workflowName : CDK_RETAIN_DATA_ON_DELETE from vars"
        } else {
            Log-Fail "$workflowName : CDK_RETAIN_DATA_ON_DELETE not from GitHub Variables"
            $allVarsCorrect = $false
        }
    }
    
    # Check AWS_ROLE_ARN is from secrets
    if ($content -match "AWS_ROLE_ARN") {
        if ($content -match "AWS_ROLE_ARN: \`$\{\{ secrets\.AWS_ROLE_ARN \}\}") {
            Log-Info "[OK] $workflowName : AWS_ROLE_ARN from secrets"
        } else {
            Log-Fail "$workflowName : AWS_ROLE_ARN not from GitHub Secrets"
            $allVarsCorrect = $false
        }
    }
}
if ($allVarsCorrect) {
    Log-Pass "Environment-specific variables are properly referenced"
}

# Test 10: Verify comments explain environment selection
Log-Test "Workflows have comments explaining environment selection"
$allHaveComments = $true
foreach ($workflow in $workflows) {
    if (-not (Test-Path $workflow)) {
        continue
    }
    
    $workflowName = Split-Path $workflow -Leaf
    $content = Get-Content $workflow -Raw
    
    # Check for explanatory comments
    if ($content -match "# All configuration comes from GitHub Environment" -or
        $content -match "# Environment is selected based on:" -or
        $content -match "# Select environment based on trigger") {
        Log-Info "[OK] $workflowName has explanatory comments"
    } else {
        Log-Info "[WARN] $workflowName : Could use more explanatory comments (optional)"
    }
}
Log-Pass "Workflows have appropriate documentation"

# Summary
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Total Tests:  $script:TestsTotal"
Write-Host "Passed:       $script:TestsPassed" -ForegroundColor Green
Write-Host "Failed:       $script:TestsFailed" -ForegroundColor Red
Write-Host ""

if ($script:TestsFailed -gt 0) {
    Write-Host "Failed Tests:" -ForegroundColor Red
    foreach ($test in $script:FailedTests) {
        Write-Host "  - $test"
    }
    Write-Host ""
    exit 1
} else {
    Write-Host "[PASS] All workflow configuration tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Validated Requirements:"
    Write-Host "  [OK] 9.1: GitHub Environments support with environment key"
    Write-Host "  [OK] 9.2: Variables and secrets loaded from GitHub Environments"
    Write-Host "  [OK] 9.3: Manual environment selection via workflow_dispatch"
    Write-Host "  [OK] 9.4: Automatic environment selection based on branch"
    Write-Host "  [OK] No DEPLOY_ENVIRONMENT references remain"
    Write-Host ""
    exit 0
}
