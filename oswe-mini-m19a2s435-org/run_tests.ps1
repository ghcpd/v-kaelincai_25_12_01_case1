# PowerShell script to run tests and collect artefacts

npm install | Out-Null
$start = Get-Date
node --test | Tee-Object -FilePath .\results\results_post_test_output.txt
$duration = (Get-Date) - $start
Write-Host "Tests completed in $($duration.TotalSeconds) seconds"

# Collect logs + metrics
Write-Host "Output: results_post_test_output.txt"

