param(
  [Parameter(Mandatory=$true)][string]$HermesHome,
  [Parameter(Mandatory=$true)][string]$PairingFile
)
$ErrorActionPreference = 'Stop'
$eoHome = (Resolve-Path -LiteralPath $HermesHome).Path
$eoPairing = (Resolve-Path -LiteralPath $PairingFile).Path
$eoFacts = Get-ChildItem -LiteralPath (Join-Path $eoHome 'installs') -Filter facts.json -Recurse -File |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $eoFacts) { throw 'Hermes managed environment was not found. Use its Python to run install.py instead.' }
$eoEnvironment = (Get-Content -LiteralPath $eoFacts.FullName -Raw | ConvertFrom-Json).packages.venv.environment
$eoPython = Join-Path $eoEnvironment 'Scripts/python.exe'
$eoPackages = Join-Path $eoEnvironment 'Lib/site-packages'
if (-not (Test-Path -LiteralPath $eoPython)) { throw 'Hermes managed Python was not found.' }
$eoInstaller = Join-Path $PSScriptRoot 'install.py'
& $eoPython -B -I -c 'import site,sys,runpy; site.addsitedir(sys.argv[1]); script=sys.argv[2]; sys.argv=[script,*sys.argv[3:]]; runpy.run_path(script,run_name="__main__")' $eoPackages $eoInstaller --home $eoHome --pairing $eoPairing
if ($LASTEXITCODE -ne 0) { throw 'EO channel installation did not complete. Existing backups are retained.' }
Write-Output 'EO channel installed. The running Hermes was not stopped or restarted.'
