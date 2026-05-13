[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$ConfigureSerena,
  [switch]$SkipSerena,
  [string]$ProjectDirectory,
  [string]$SerenaDirectory,
  [ValidateRange(1, 64)]
  [int]$IndexParallelism = 4,
  [switch]$AllowNonUnrealProject
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Section([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Step([string]$Message) {
  Write-Host "-- $Message" -ForegroundColor DarkCyan
}

function Write-Success([string]$Message) {
  Write-Host "OK  $Message" -ForegroundColor Green
}

function Write-Info([string]$Message) {
  Write-Host "INFO $Message" -ForegroundColor Gray
}

function Write-WarnLine([string]$Message) {
  Write-Host "WARN $Message" -ForegroundColor Yellow
}

function Fail([string]$Message) {
  throw $Message
}

function Get-CommandPath([string]$Name) {
  $command = Get-Command -Name $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    return $null
  }

  return $command.Source
}

function Assert-RequiredCommand([string]$Name) {
  $path = Get-CommandPath -Name $Name
  if (-not $path) {
    Fail "Missing required command '$Name'. Install it first and make sure it is available on PATH."
  }

  Write-Success "Found ${Name}: $path"
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Format-CommandForDisplay(
  [string]$FilePath,
  [string[]]$Arguments
) {
  $parts = New-Object System.Collections.Generic.List[string]
  $parts.Add($FilePath)

  foreach ($argument in $Arguments) {
    if ($argument -match '\s') {
      $parts.Add(('"{0}"' -f $argument.Replace('"', '""')))
    }
    else {
      $parts.Add($argument)
    }
  }

  return ($parts -join ' ')
}

function Invoke-NativeCommand(
  [string]$FilePath,
  [string[]]$Arguments,
  [string]$WorkingDirectory,
  [string]$Label,
  [switch]$DryRunMode
) {
  Write-Step $Label

  if ($DryRunMode) {
    $commandLine = Format-CommandForDisplay -FilePath $FilePath -Arguments $Arguments
    Write-Info "[DryRun] Would run in ${WorkingDirectory}: $commandLine"
    Write-Success "$Label skipped in dry-run mode"
    return
  }

  Push-Location -Path $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      Fail "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
  }
  finally {
    Pop-Location
  }

  Write-Success "$Label completed"
}

function Get-RepoRoot() {
  if (-not $PSScriptRoot) {
    Fail "Unable to resolve the script directory."
  }

  $repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
  $packageJsonPath = Join-Path $repoRoot "package.json"

  if (-not (Test-Path -LiteralPath $packageJsonPath)) {
    Fail "Could not find package.json next to the repo root: $packageJsonPath"
  }

  return $repoRoot
}

function Get-PackageMetadata([string]$RepoRoot) {
  $packageJsonPath = Join-Path $RepoRoot "package.json"
  return Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
}

function Get-HostPlatformPackageCandidates(
  [string]$RepoRoot,
  [string]$PackageName
) {
  $isWindowsHost = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
  $isMacHost = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)
  $isLinuxHost = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Linux)

  if ($isWindowsHost) {
    $platformToken = "windows"
  }
  elseif ($isMacHost) {
    $platformToken = "darwin"
  }
  elseif ($isLinuxHost) {
    $platformToken = "linux"
  }
  else {
    Fail "Unsupported host platform for local-fork install."
  }

  $osArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
  switch ($osArchitecture) {
    "x64" { $archToken = "x64" }
    "arm64" { $archToken = "arm64" }
    default { Fail "Unsupported host architecture for local-fork install: $osArchitecture" }
  }

  $linuxSuffix = ""
  if ($platformToken -eq "linux") {
    $alpineReleasePath = "/etc/alpine-release"
    if (Test-Path -LiteralPath $alpineReleasePath) {
      $linuxSuffix = "-musl"
    }
  }

  $primarySuffix = "$platformToken-$archToken$linuxSuffix"
  $candidateSuffixes = New-Object System.Collections.Generic.List[string]
  $candidateSuffixes.Add($primarySuffix)

  if ($archToken -eq "x64") {
    $candidateSuffixes.Add("$primarySuffix-baseline")
  }

  if ($env:OH_MY_OPENCODE_FORCE_BASELINE -eq "1" -and $candidateSuffixes.Count -gt 1) {
    $reorderedSuffixes = New-Object System.Collections.Generic.List[string]
    $reorderedSuffixes.Add($candidateSuffixes[1])
    $reorderedSuffixes.Add($candidateSuffixes[0])
    $candidateSuffixes = $reorderedSuffixes
  }

  $binaryFileName = if ($platformToken -eq "windows") { "oh-my-opencode.exe" } else { "oh-my-opencode" }
  $candidates = New-Object System.Collections.Generic.List[object]

  foreach ($packageSuffix in $candidateSuffixes) {
    $packageFullName = "$PackageName-$packageSuffix"
    $compileTarget = "bun-$platformToken-$archToken$linuxSuffix"
    if ($packageSuffix.EndsWith("-baseline")) {
      $compileTarget = "$compileTarget-baseline"
    }

    $resolvedInstalledBinaryPath = Join-Path $RepoRoot (Join-Path "node_modules\$packageFullName\bin" $binaryFileName)
    if (-not (Test-Path -LiteralPath $resolvedInstalledBinaryPath)) {
      $resolvedInstalledBinaryPath = $null
    }

    $candidates.Add([pscustomobject]@{
      packageName = $packageFullName
      packageSuffix = $packageSuffix
      binaryRelativePath = "$packageFullName/bin/$binaryFileName"
      binaryFileName = $binaryFileName
      compileTarget = $compileTarget
      expectedBuiltBinaryPath = Join-Path $RepoRoot (Join-Path "packages\$packageSuffix\bin" $binaryFileName)
      resolvedInstalledBinaryPath = $resolvedInstalledBinaryPath
    })
  }

  return $candidates.ToArray()
}

function Get-PreferredCandidate([object[]]$Candidates) {
  foreach ($candidate in $Candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate.resolvedInstalledBinaryPath)) {
      return $candidate
    }
  }

  if ($Candidates.Count -gt 0) {
    return $Candidates[0]
  }

  return $null
}

function Get-BuiltBinaryCandidate([object[]]$Candidates) {
  foreach ($candidate in $Candidates) {
    if (Test-Path -LiteralPath $candidate.expectedBuiltBinaryPath) {
      return $candidate
    }
  }

  if ($Candidates.Count -gt 0) {
    return $Candidates[0]
  }

  return $null
}

function Build-HostPlatformBinary(
  [string]$RepoRoot,
  [Parameter(Mandatory = $true)]
  [object]$Candidate,
  [switch]$DryRunMode
) {
  $entryPoint = "src/cli/index.ts"
  $outputDirectory = Split-Path -Parent $Candidate.expectedBuiltBinaryPath

  if (-not $DryRunMode -and -not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }

  $arguments = @(
    "build",
    "--compile",
    "--minify",
    "--sourcemap",
    "--bytecode",
    "--target=$($Candidate.compileTarget)",
    $entryPoint,
    "--outfile=$($Candidate.expectedBuiltBinaryPath)"
  )

  Invoke-NativeCommand -FilePath "bun" -Arguments $arguments -WorkingDirectory $RepoRoot -Label "Building host binary for $($Candidate.packageSuffix)" -DryRunMode:$DryRunMode
}

function Sync-HostPlatformBinary(
  [string]$RepoRoot,
  [string]$PackageName,
  [switch]$DryRunMode
) {
  Write-Section "Refreshing the host platform binary"

  $candidates = @(Get-HostPlatformPackageCandidates -RepoRoot $RepoRoot -PackageName $PackageName)
  if ($candidates.Count -eq 0) {
    Fail "Could not determine any host platform package candidates."
  }

  $targetCandidate = Get-PreferredCandidate -Candidates $candidates
  $sourceCandidate = Get-BuiltBinaryCandidate -Candidates $candidates

  if ([string]::IsNullOrWhiteSpace($targetCandidate.resolvedInstalledBinaryPath)) {
    $searchedTargets = ($candidates | ForEach-Object { $_.binaryRelativePath }) -join ", "
    if (-not $DryRunMode) {
      Fail "Installed host platform package target was not found after npm link. Wrapper candidates: $searchedTargets"
    }
    Write-Info ("[DryRun] Expected installed host package target was not found yet. Wrapper candidates: {0}" -f $searchedTargets)
  }

  Build-HostPlatformBinary -RepoRoot $RepoRoot -Candidate $targetCandidate -DryRunMode:$DryRunMode
  $sourceCandidate = Get-BuiltBinaryCandidate -Candidates @($targetCandidate, $sourceCandidate)

  if ($DryRunMode) {
    Write-Info ("[DryRun] Would sync built binary '{0}' to installed host package target '{1}'" -f $sourceCandidate.expectedBuiltBinaryPath, $targetCandidate.resolvedInstalledBinaryPath)
    return
  }

  if (-not (Test-Path -LiteralPath $sourceCandidate.expectedBuiltBinaryPath)) {
    Fail "Built host binary was not found after host binary build: $($sourceCandidate.expectedBuiltBinaryPath)"
  }

  $targetDirectory = Split-Path -Parent $targetCandidate.resolvedInstalledBinaryPath
  if (-not (Test-Path -LiteralPath $targetDirectory)) {
    Fail "Installed host platform package directory does not exist: $targetDirectory"
  }

  Write-Step ("Copying fresh host binary to {0}" -f $targetCandidate.resolvedInstalledBinaryPath)
  Copy-Item -LiteralPath $sourceCandidate.expectedBuiltBinaryPath -Destination $targetCandidate.resolvedInstalledBinaryPath -Force
  Write-Success "Host platform binary refreshed"
}

function Get-OpenCodeConfigCandidates() {
  $candidates = New-Object System.Collections.Generic.List[object]
  $seen = @{}

  function Add-Candidate([string]$Dir, [string]$Reason) {
    if ([string]::IsNullOrWhiteSpace($Dir)) {
      return
    }

    $trimmed = $Dir.Trim()
    $key = $trimmed.ToLowerInvariant()
    if ($seen.ContainsKey($key)) {
      return
    }

    $seen[$key] = $true
    $candidates.Add([pscustomobject]@{
      Dir = $trimmed
      Reason = $Reason
    })
  }

  if (-not [string]::IsNullOrWhiteSpace($env:OPENCODE_CONFIG_DIR)) {
    Add-Candidate -Dir $env:OPENCODE_CONFIG_DIR -Reason "OPENCODE_CONFIG_DIR"
  }

  $userProfile = [Environment]::GetFolderPath("UserProfile")
  if ([string]::IsNullOrWhiteSpace($userProfile)) {
    $userProfile = $HOME
  }

  if (-not [string]::IsNullOrWhiteSpace($userProfile)) {
    Add-Candidate -Dir (Join-Path $userProfile ".config\opencode") -Reason "OpenCode CLI default"
  }

  if (-not [string]::IsNullOrWhiteSpace($env:APPDATA)) {
    Add-Candidate -Dir (Join-Path $env:APPDATA "ai.opencode.desktop.dev") -Reason "OpenCode Desktop Dev"
    Add-Candidate -Dir (Join-Path $env:APPDATA "ai.opencode.desktop") -Reason "OpenCode Desktop"
  }

  return $candidates.ToArray()
}

function Resolve-OpenCodeConfigTarget([object[]]$Candidates) {
  foreach ($candidate in $Candidates) {
    $jsoncPath = Join-Path $candidate.Dir "opencode.jsonc"
    if (Test-Path -LiteralPath $jsoncPath) {
      return [pscustomobject]@{
        Directory = $candidate.Dir
        Path = $jsoncPath
        Format = "jsonc"
        Reason = $candidate.Reason
      }
    }

    $jsonPath = Join-Path $candidate.Dir "opencode.json"
    if (Test-Path -LiteralPath $jsonPath) {
      return [pscustomobject]@{
        Directory = $candidate.Dir
        Path = $jsonPath
        Format = "json"
        Reason = $candidate.Reason
      }
    }
  }

  if ($Candidates.Count -eq 0) {
    return $null
  }

  $fallback = $Candidates[0]
  return [pscustomobject]@{
    Directory = $fallback.Dir
    Path = Join-Path $fallback.Dir "opencode.json"
    Format = "none"
    Reason = $fallback.Reason
  }
}

function Get-PluginEntriesFromArrayText([string]$ArrayText) {
  $plugins = New-Object System.Collections.Generic.List[string]
  $matches = [regex]::Matches($ArrayText, '"((?:\\.|[^"\\])*)"')

  foreach ($match in $matches) {
    $plugins.Add($match.Groups[1].Value)
  }

  return $plugins.ToArray()
}

function Normalize-PluginEntries(
  [string[]]$Plugins,
  [string]$PluginSpecifier
) {
  $canonicalName = "oh-my-openagent"
  $legacyName = "oh-my-opencode"
  $targetSpecifier = if ([string]::IsNullOrWhiteSpace($PluginSpecifier)) { $legacyName } else { $PluginSpecifier }

  $safePlugins = @()
  if ($Plugins) {
    $safePlugins = @($Plugins)
  }

  $otherPlugins = @($safePlugins | Where-Object {
    -not ($_.Equals($canonicalName) -or $_.StartsWith("$canonicalName@") -or $_.Equals($legacyName) -or $_.StartsWith("$legacyName@") -or $_.Equals($targetSpecifier))
  })

  $normalized = New-Object System.Collections.Generic.List[string]
  foreach ($plugin in $otherPlugins) {
    $normalized.Add($plugin)
  }

  $normalized.Add($targetSpecifier)

  return $normalized.ToArray()
}

function Get-LocalPluginSpecifier(
  [string]$RepoRoot,
  [switch]$DryRunMode
) {
  $entryPath = Join-Path $RepoRoot "dist\index.js"
  if (-not $DryRunMode -and -not (Test-Path -LiteralPath $entryPath)) {
    Fail "Built plugin entry was not found: $entryPath"
  }

  return ([System.Uri]$entryPath).AbsoluteUri
}

function Format-PluginArray([string[]]$Plugins) {
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($plugin in $Plugins) {
    $lines.Add("    `"$plugin`"")
  }

  if ($lines.Count -eq 0) {
    return "[]"
  }

  return "[" + [Environment]::NewLine + ($lines -join ("," + [Environment]::NewLine)) + [Environment]::NewLine + "  ]"
}

function Ensure-OpenCodePluginRegistration() {
  param(
    [switch]$DryRunMode,
    [Parameter(Mandatory = $true)]
    [string]$PluginSpecifier,
    [Parameter(Mandatory = $true)]
    [string]$DisplayName
  )

  $candidates = Get-OpenCodeConfigCandidates
  $target = Resolve-OpenCodeConfigTarget -Candidates $candidates

  if ($null -eq $target) {
    return [pscustomobject]@{
      Success = $false
      Action = "skipped"
      Directory = $null
      Path = $null
      Message = "Could not determine the OpenCode config directory."
      ManualStep = $null
    }
  }

  $manualStep = "Ensure the plugin array in '$($target.Path)' contains " + ('"{0}"' -f $PluginSpecifier) + "."

  try {
    if (-not $DryRunMode) {
      [System.IO.Directory]::CreateDirectory($target.Directory) | Out-Null
    }

    if ($target.Format -eq "none") {
      $content = @"
{
  "plugin": [
    "$PluginSpecifier"
  ]
}
"@

      if ($DryRunMode) {
        return [pscustomobject]@{
          Success = $true
          Action = "dry-run-create"
          Directory = $target.Directory
          Path = $target.Path
          Message = "Dry run: would create an OpenCode config file ($($target.Reason))."
          ManualStep = $null
        }
      }

      Write-Utf8NoBom -Path $target.Path -Content $content

      return [pscustomobject]@{
        Success = $true
        Action = "created"
        Directory = $target.Directory
        Path = $target.Path
        Message = "Created an OpenCode config file ($($target.Reason))."
        ManualStep = $null
      }
    }

    $originalContent = Get-Content -LiteralPath $target.Path -Raw
    $pluginRegex = '(?ms)((?:"plugin"|plugin)\s*:\s*)\[(.*?)\]'
    $match = [regex]::Match($originalContent, $pluginRegex)
    $updatedContent = $originalContent

    if ($match.Success) {
      $existingPlugins = Get-PluginEntriesFromArrayText -ArrayText $match.Groups[2].Value
      $normalizedPlugins = Normalize-PluginEntries -Plugins $existingPlugins -PluginSpecifier $PluginSpecifier
      $replacement = $match.Groups[1].Value + (Format-PluginArray -Plugins $normalizedPlugins)

      $updatedContent = $originalContent.Substring(0, $match.Index) + $replacement + $originalContent.Substring($match.Index + $match.Length)
    }
    else {
      $normalizedPlugins = Normalize-PluginEntries -Plugins @() -PluginSpecifier $PluginSpecifier
      $braceIndex = $originalContent.IndexOf("{")
      if ($braceIndex -lt 0) {
        return [pscustomobject]@{
          Success = $false
          Action = "skipped"
          Directory = $target.Directory
          Path = $target.Path
          Message = "The config file does not contain a JSON root object, so automatic editing was skipped."
          ManualStep = $manualStep
        }
      }

      $tail = $originalContent.Substring($braceIndex + 1)
      $tailWithoutComments = [regex]::Replace($tail, '(?ms)//.*?$|/\*.*?\*/', '')
      $trimmedTail = $tailWithoutComments.TrimStart()
      $propertySuffix = if ($trimmedTail.StartsWith("}")) { "" } else { "," }

      $pluginProperty = [Environment]::NewLine + "  `"plugin`": " + (Format-PluginArray -Plugins $normalizedPlugins) + $propertySuffix
      $updatedContent = $originalContent.Substring(0, $braceIndex + 1) + $pluginProperty + $originalContent.Substring($braceIndex + 1)
    }

    if ($updatedContent -ne $originalContent) {
      if ($DryRunMode) {
        return [pscustomobject]@{
          Success = $true
          Action = "dry-run-update"
          Directory = $target.Directory
          Path = $target.Path
          Message = "Dry run: would update the OpenCode config file ($($target.Reason))."
          ManualStep = $null
        }
      }

      Write-Utf8NoBom -Path $target.Path -Content $updatedContent
      return [pscustomobject]@{
        Success = $true
        Action = "updated"
        Directory = $target.Directory
        Path = $target.Path
        Message = "Updated the OpenCode config file ($($target.Reason))."
        ManualStep = $null
      }
    }

    return [pscustomobject]@{
      Success = $true
      Action = "verified"
      Directory = $target.Directory
      Path = $target.Path
      Message = "The OpenCode plugin entry already exists for $DisplayName."
      ManualStep = $null
    }
  }
  catch {
    return [pscustomobject]@{
      Success = $false
      Action = "skipped"
      Directory = $target.Directory
      Path = $target.Path
      Message = $_.Exception.Message
      ManualStep = $manualStep
    }
  }
}

function Ensure-OpenCodePluginDependency() {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigDirectory,
    [Parameter(Mandatory = $true)]
    [string]$PackageName,
    [switch]$DryRunMode
  )

  if ([string]::IsNullOrWhiteSpace($ConfigDirectory)) {
    return [pscustomobject]@{
      Success = $false
      Message = "Config directory was not provided."
    }
  }

  try {
    if (-not $DryRunMode) {
      [System.IO.Directory]::CreateDirectory($ConfigDirectory) | Out-Null
    }

    $packageJsonPath = Join-Path $ConfigDirectory "package.json"
    if (-not (Test-Path -LiteralPath $packageJsonPath)) {
      $content = @"
{
  "dependencies": {
    "@opencode-ai/plugin": "1.4.11"
  }
}
"@

      if (-not $DryRunMode) {
        Write-Utf8NoBom -Path $packageJsonPath -Content $content
      }
      else {
        Write-Info "[DryRun] Would create package.json in $ConfigDirectory"
      }
    }

    Invoke-NativeCommand -FilePath "npm" -Arguments @("link", $PackageName) -WorkingDirectory $ConfigDirectory -Label "Linking local plugin into OpenCode config environment" -DryRunMode:$DryRunMode | Out-Null

    return [pscustomobject]@{
      Success = $true
      Message = "Ensured local plugin dependency in OpenCode config environment."
    }
  }
  catch {
    return [pscustomobject]@{
      Success = $false
      Message = $_.Exception.Message
    }
  }
}

function Resolve-ExistingDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [string]$BaseDirectory = (Get-Location).Path
  )

  $trimmedPath = $InputPath.Trim().Trim('"')
  if ([string]::IsNullOrWhiteSpace($trimmedPath)) {
    throw "Directory path is required."
  }

  $expandedPath = [Environment]::ExpandEnvironmentVariables($trimmedPath)
  $absolutePath = if ([System.IO.Path]::IsPathRooted($expandedPath)) {
    $expandedPath
  } else {
    Join-Path -Path $BaseDirectory -ChildPath $expandedPath
  }

  if (-not (Test-Path -LiteralPath $absolutePath -PathType Container)) {
    throw "Directory does not exist: $absolutePath"
  }

  return (Resolve-Path -LiteralPath $absolutePath).ProviderPath
}

function Read-DirectoryFromUser(
  [string]$Prompt,
  [string]$DefaultPath,
  [string]$BaseDirectory
) {
  while ($true) {
    $promptText = if ([string]::IsNullOrWhiteSpace($DefaultPath)) { $Prompt } else { "$Prompt [$DefaultPath]" }
    $inputValue = Read-Host $promptText
    if ([string]::IsNullOrWhiteSpace($inputValue) -and -not [string]::IsNullOrWhiteSpace($DefaultPath)) {
      $inputValue = $DefaultPath
    }

    try {
      return Resolve-ExistingDirectory -InputPath $inputValue -BaseDirectory $BaseDirectory
    }
    catch {
      Write-WarnLine $_.Exception.Message
      Write-Info "Please enter an existing directory path."
    }
  }
}

function Read-YesNo(
  [string]$Prompt,
  [bool]$DefaultYes
) {
  $suffix = if ($DefaultYes) { "[Y/n]" } else { "[y/N]" }

  while ($true) {
    $answer = (Read-Host "$Prompt $suffix").Trim()
    if ([string]::IsNullOrWhiteSpace($answer)) {
      return $DefaultYes
    }

    switch -Regex ($answer) {
      '^(y|yes)$' { return $true }
      '^(n|no)$' { return $false }
      default { Write-WarnLine "Please answer y or n." }
    }
  }
}

function Read-IntegerInRange(
  [string]$Prompt,
  [int]$DefaultValue,
  [int]$Minimum,
  [int]$Maximum
) {
  while ($true) {
    $answer = (Read-Host "$Prompt [$DefaultValue]").Trim()
    if ([string]::IsNullOrWhiteSpace($answer)) {
      return $DefaultValue
    }

    $parsed = 0
    if ([int]::TryParse($answer, [ref]$parsed) -and $parsed -ge $Minimum -and $parsed -le $Maximum) {
      return $parsed
    }

    Write-WarnLine "Please enter a number from $Minimum to $Maximum."
  }
}

function Test-UnrealProjectDirectory([string]$ProjectRoot) {
  $uprojectFiles = @(Get-ChildItem -LiteralPath $ProjectRoot -Filter "*.uproject" -File -ErrorAction SilentlyContinue)
  $sourceDirectory = Join-Path $ProjectRoot "Source"
  return ($uprojectFiles.Count -gt 0 -or (Test-Path -LiteralPath $sourceDirectory -PathType Container))
}

function Convert-ToConfigPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return ([System.IO.Path]::GetFullPath($Path)).Replace("\", "/")
}

function ConvertTo-Hashtable {
  param(
    [AllowNull()]
    $Value
  )

  if ($null -eq $Value) {
    return $null
  }

  if ($Value -is [System.Collections.IDictionary]) {
    $result = @{}
    foreach ($key in $Value.Keys) {
      $result[$key] = ConvertTo-Hashtable -Value $Value[$key]
    }
    return $result
  }

  if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
    $items = New-Object System.Collections.Generic.List[object]
    foreach ($item in $Value) {
      $items.Add((ConvertTo-Hashtable -Value $item))
    }
    return $items.ToArray()
  }

  if ($Value.PSObject -and @($Value.PSObject.Properties).Count -gt 0 -and -not ($Value -is [string]) -and -not ($Value -is [ValueType])) {
    $result = @{}
    foreach ($property in $Value.PSObject.Properties) {
      $result[$property.Name] = ConvertTo-Hashtable -Value $property.Value
    }
    return $result
  }

  return $Value
}

function Read-JsoncObject {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return @{}
  }

  $raw = Get-Content -LiteralPath $Path -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @{}
  }

  try {
    $withoutBlockComments = [regex]::Replace($raw, '(?s)/\*.*?\*/', '')
    $withoutLineComments = ($withoutBlockComments -split "`r?`n" | Where-Object { $_ -notmatch '^\s*//' }) -join [Environment]::NewLine
    $parsed = $withoutLineComments | ConvertFrom-Json
  }
  catch {
    throw "Could not parse config file '$Path'. Fix the JSON/JSONC before running Serena setup again. $($_.Exception.Message)"
  }

  if ($null -eq $parsed) {
    return @{}
  }

  $normalized = ConvertTo-Hashtable -Value $parsed
  if ($normalized -is [System.Collections.IDictionary]) {
    return $normalized
  }

  return @{}
}

function Write-JsoncObject {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [hashtable]$Data,
    [switch]$DryRunMode
  )

  $json = $Data | ConvertTo-Json -Depth 20
  if (-not $DryRunMode) {
    Write-Utf8NoBom -Path $Path -Content ($json + [Environment]::NewLine)
  }
}

function Convert-ToPowerShellSingleQuotedLiteral {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  return "'" + $Value.Replace("'", "''") + "'"
}

function Convert-ToYamlSingleQuotedScalar {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  return "'" + $Value.Replace("'", "''") + "'"
}

function Write-SerenaUnrealProjectConfig {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,
    [Parameter(Mandatory = $true)]
    [int]$Parallelism,
    [switch]$DryRunMode
  )

  $serenaDirectory = Join-Path -Path $ProjectRoot -ChildPath ".serena"
  $projectConfigPath = Join-Path -Path $serenaDirectory -ChildPath "project.yml"
  $projectName = Split-Path -Path $ProjectRoot -Leaf
  $quotedProjectName = Convert-ToYamlSingleQuotedScalar -Value $projectName
  $ignoredPaths = @(
    "Binaries/**",
    "Build/**",
    "DerivedDataCache/**",
    "Intermediate/**",
    "Saved/**",
    ".vs/**",
    ".idea/**",
    ".vscode/**",
    "Plugins/**/Binaries/**",
    "Plugins/**/Build/**",
    "Plugins/**/DerivedDataCache/**",
    "Plugins/**/Intermediate/**",
    "Plugins/**/Saved/**",
    "nul"
  )

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("# Serena project configuration generated for Unreal Engine projects.")
  $lines.Add("# Re-run the installer when you intentionally want to reset UE-specific indexing settings.")
  $lines.Add("project_name: $quotedProjectName")
  $lines.Add("")
  $lines.Add("languages:")
  $lines.Add("- cpp")
  $lines.Add("")
  $lines.Add("encoding: utf-8")
  $lines.Add("ignore_all_files_in_gitignore: true")
  $lines.Add("")
  $lines.Add("ls_specific_settings:")
  $lines.Add("  cpp:")
  $lines.Add("    index_parallelism: $Parallelism")
  $lines.Add("")
  $lines.Add("ignored_paths:")
  foreach ($ignoredPath in $ignoredPaths) {
    $lines.Add("- $ignoredPath")
  }

  $content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine

  if ($DryRunMode) {
    if (Test-Path -LiteralPath $projectConfigPath -PathType Leaf) {
      Write-Info "[DryRun] Would back up existing Serena UE project config: $projectConfigPath"
    }
    Write-Info "[DryRun] Would generate Serena UE project config: $projectConfigPath"
    return $projectConfigPath
  }

  if (-not (Test-Path -LiteralPath $serenaDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $serenaDirectory -Force | Out-Null
  }

  if (Test-Path -LiteralPath $projectConfigPath -PathType Leaf) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "$projectConfigPath.bak-$timestamp"
    Copy-Item -LiteralPath $projectConfigPath -Destination $backupPath -Force
    Write-Info "Backed up existing Serena project config: $backupPath"
  }

  Write-Utf8NoBom -Path $projectConfigPath -Content $content
  return $projectConfigPath
}

function Get-DefaultSerenaForkPath([string]$RepoRoot) {
  $candidate = Join-Path -Path $RepoRoot -ChildPath "..\..\serena-lsp"
  if (Test-Path -LiteralPath $candidate -PathType Container) {
    return (Resolve-Path -LiteralPath $candidate).ProviderPath
  }

  return $null
}

function Resolve-SerenaForkDirectory(
  [string]$RepoRoot,
  [string]$RequestedDirectory
) {
  if (-not [string]::IsNullOrWhiteSpace($RequestedDirectory)) {
    $resolved = Resolve-ExistingDirectory -InputPath $RequestedDirectory -BaseDirectory $RepoRoot
  }
  else {
    $defaultSerenaPath = Get-DefaultSerenaForkPath -RepoRoot $RepoRoot
    if ($defaultSerenaPath) {
      Write-Info "Detected local serena-lsp fork: $defaultSerenaPath"
      $resolved = $defaultSerenaPath
    }
    else {
      Write-WarnLine "Could not auto-detect serena-lsp at ../../serena-lsp from this repository."
      $resolved = Read-DirectoryFromUser -Prompt "Enter the local serena-lsp fork directory" -DefaultPath "" -BaseDirectory $RepoRoot
    }
  }

  $pyprojectPath = Join-Path -Path $resolved -ChildPath "pyproject.toml"
  if (-not (Test-Path -LiteralPath $pyprojectPath -PathType Leaf)) {
    Fail "Expected Serena fork at '$resolved', but pyproject.toml was not found."
  }

  return $resolved
}

function Resolve-SerenaProjectDirectory(
  [string]$RepoRoot,
  [string]$RequestedDirectory,
  [switch]$AllowNonUnreal
) {
  if (-not [string]::IsNullOrWhiteSpace($RequestedDirectory)) {
    $resolved = Resolve-ExistingDirectory -InputPath $RequestedDirectory -BaseDirectory (Get-Location).Path
    if (-not $AllowNonUnreal -and -not (Test-UnrealProjectDirectory -ProjectRoot $resolved)) {
      Fail "The project directory does not look like an Unreal Engine project: $resolved. Pass -AllowNonUnrealProject if this is intentional."
    }
    return $resolved
  }

  while ($true) {
    $resolved = Read-DirectoryFromUser -Prompt "Enter the target Unreal Engine project directory" -DefaultPath "" -BaseDirectory $RepoRoot
    if (Test-UnrealProjectDirectory -ProjectRoot $resolved) {
      return $resolved
    }

    Write-WarnLine "No .uproject file or Source directory was found in: $resolved"
    if ($AllowNonUnreal -or (Read-YesNo -Prompt "Use this directory anyway" -DefaultYes:$false)) {
      return $resolved
    }
  }
}

function Configure-SerenaForProject {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [string]$RequestedProjectDirectory,
    [string]$RequestedSerenaDirectory,
    [int]$RequestedIndexParallelism,
    [switch]$DryRunMode,
    [switch]$AllowNonUnreal
  )

  Write-Section "Configuring Serena LSP for an Unreal Engine project"
  Write-Info "This step writes .opencode/oh-my-openagent.jsonc, .opencode/oh-my-opencode.jsonc, and .serena/project.yml in the target project."
  Write-Info "Existing Serena project.yml files are backed up before being replaced."

  Assert-RequiredCommand -Name "uv"

  $projectRoot = Resolve-SerenaProjectDirectory -RepoRoot $RepoRoot -RequestedDirectory $RequestedProjectDirectory -AllowNonUnreal:$AllowNonUnreal
  $serenaRoot = Resolve-SerenaForkDirectory -RepoRoot $RepoRoot -RequestedDirectory $RequestedSerenaDirectory
  $parallelism = if ($RequestedIndexParallelism -ge 1 -and $RequestedIndexParallelism -le 64) { $RequestedIndexParallelism } else { 4 }

  if ([string]::IsNullOrWhiteSpace($RequestedProjectDirectory)) {
    $parallelism = Read-IntegerInRange -Prompt "Serena C++ index parallelism" -DefaultValue $parallelism -Minimum 1 -Maximum 64
  }

  $configDirectory = Join-Path -Path $projectRoot -ChildPath ".opencode"
  if (-not $DryRunMode -and -not (Test-Path -LiteralPath $configDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
  }

  $canonicalConfigPath = Join-Path -Path $configDirectory -ChildPath "oh-my-openagent.jsonc"
  $legacyConfigPath = Join-Path -Path $configDirectory -ChildPath "oh-my-opencode.jsonc"
  $projectRootForConfig = Convert-ToConfigPath -Path $projectRoot
  $serenaRootForConfig = Convert-ToConfigPath -Path $serenaRoot
  $projectRootForCommand = Convert-ToPowerShellSingleQuotedLiteral -Value $projectRoot
  $existingConfig = Read-JsoncObject -Path $canonicalConfigPath
  if (-not ($existingConfig -is [System.Collections.IDictionary]) -or @($existingConfig.Keys).Count -eq 0) {
    $existingConfig = Read-JsoncObject -Path $legacyConfigPath
  }

  if (-not ($existingConfig -is [System.Collections.IDictionary])) {
    $existingConfig = @{}
  }

  if (-not $existingConfig.ContainsKey('lsp') -or -not ($existingConfig['lsp'] -is [System.Collections.IDictionary])) {
    $existingConfig['lsp'] = @{}
  }

  $lspConfig = @{}
  foreach ($key in $existingConfig['lsp'].Keys) {
    $lspConfig[$key] = $existingConfig['lsp'][$key]
  }

  $lspConfig['provider'] = 'serena'
  $lspConfig['serena'] = @{
    transport = 'managed-http'
    projectRoot = $projectRootForConfig
    wrapperCommand = @('oh-my-opencode', 'serena', 'service')
    serenaCommand = @('uv', 'run', '--directory', $serenaRootForConfig, 'serena')
    requiredTools = @('find_symbol', 'get_symbols_overview')
  }

  $existingConfig['lsp'] = $lspConfig

  Write-JsoncObject -Path $canonicalConfigPath -Data $existingConfig -DryRunMode:$DryRunMode
  Write-JsoncObject -Path $legacyConfigPath -Data $existingConfig -DryRunMode:$DryRunMode
  $serenaProjectConfigPath = Write-SerenaUnrealProjectConfig -ProjectRoot $projectRoot -Parallelism $parallelism -DryRunMode:$DryRunMode

  if ($DryRunMode) {
    Write-Info "[DryRun] Would generate/update Serena config: $canonicalConfigPath"
    Write-Info "[DryRun] Would sync legacy Serena config: $legacyConfigPath"
  }
  else {
    Write-Success "Generated Serena config: $canonicalConfigPath"
    Write-Success "Synced legacy Serena config: $legacyConfigPath"
    Write-Success "Generated Serena UE project config: $serenaProjectConfigPath"
  }

  Write-Host ""
  Write-Host "Serena next steps:" -ForegroundColor Cyan
  Write-Host "  oh-my-opencode serena service ensure --project $projectRootForCommand"
  Write-Host "  oh-my-opencode serena service pre-index --project $projectRootForCommand"
  Write-Host "  oh-my-opencode serena service status --project $projectRootForCommand"

  return [pscustomobject]@{
    ProjectRoot = $projectRoot
    SerenaRoot = $serenaRoot
    CanonicalConfigPath = $canonicalConfigPath
    LegacyConfigPath = $legacyConfigPath
    SerenaProjectConfigPath = $serenaProjectConfigPath
    Parallelism = $parallelism
  }
}

try {
  if ($ConfigureSerena -and $SkipSerena) {
    Fail "Choose either -ConfigureSerena or -SkipSerena, not both."
  }

  if ($SkipSerena -and (-not [string]::IsNullOrWhiteSpace($ProjectDirectory) -or -not [string]::IsNullOrWhiteSpace($SerenaDirectory))) {
    Fail "-SkipSerena cannot be used together with -ProjectDirectory or -SerenaDirectory."
  }

  Write-Host "oh-my-openkit local installer" -ForegroundColor Cyan
  Write-Info "The installer will first install and link the local fork. Serena setup is optional and runs after installation."
  if ($DryRun) {
    Write-WarnLine "Dry run mode is enabled. Commands and file writes will be shown but not executed."
  }

  Write-Section "Resolving the local oh-my-openkit repository"
  $repoRoot = Get-RepoRoot
  $package = Get-PackageMetadata -RepoRoot $repoRoot

  Write-Success "Repository root: $repoRoot"
  Write-Info "Package name: $($package.name)"
  Write-Info "Version: $($package.version)"

  Write-Section "Checking installation prerequisites"
  Assert-RequiredCommand -Name "bun"
  Assert-RequiredCommand -Name "npm"

  $gitPath = Get-CommandPath -Name "git"
  if ($gitPath) {
    Write-Success "Found git: $gitPath"
  }
  else {
    Write-WarnLine "git was not found. The installer can continue, but syncing your local fork will be less convenient."
  }

  Write-Section "Installing and linking the local fork"
  Invoke-NativeCommand -FilePath "bun" -Arguments @("install") -WorkingDirectory $repoRoot -Label "Running bun install" -DryRunMode:$DryRun
  Invoke-NativeCommand -FilePath "bun" -Arguments @("run", "build") -WorkingDirectory $repoRoot -Label "Running bun run build" -DryRunMode:$DryRun
  Invoke-NativeCommand -FilePath "npm" -Arguments @("link") -WorkingDirectory $repoRoot -Label "Running npm link" -DryRunMode:$DryRun
  Sync-HostPlatformBinary -RepoRoot $repoRoot -PackageName $package.name -DryRunMode:$DryRun

  Write-Section "Registering the OpenCode plugin"
  $pluginSpecifier = Get-LocalPluginSpecifier -RepoRoot $repoRoot -DryRunMode:$DryRun
  $configResult = Ensure-OpenCodePluginRegistration -DryRunMode:$DryRun -PluginSpecifier $pluginSpecifier -DisplayName $package.name
  if ($configResult.Success) {
    Write-Success "$($configResult.Message)"
    if ($configResult.Path) {
      Write-Info "Config file: $($configResult.Path)"
    }
  }
  else {
    Write-WarnLine "Automatic OpenCode config update was skipped: $($configResult.Message)"
    if ($configResult.Path) {
      Write-Info "Target config: $($configResult.Path)"
    }
    if ($configResult.ManualStep) {
      Write-Info "Manual next step: $($configResult.ManualStep)"
    }
  }

  if ($configResult.Path) {
    Write-Section "Ensuring plugin dependency in the OpenCode config environment"
    $pluginDependencyResult = Ensure-OpenCodePluginDependency -ConfigDirectory $configResult.Directory -PackageName $package.name -DryRunMode:$DryRun
    if ($pluginDependencyResult.Success) {
      Write-Success $pluginDependencyResult.Message
    }
    else {
      Write-WarnLine "Automatic plugin dependency linking was skipped: $($pluginDependencyResult.Message)"
    }
  }

  Write-Section "Serena configuration"
  $shouldConfigureSerena = $ConfigureSerena -or -not [string]::IsNullOrWhiteSpace($ProjectDirectory) -or -not [string]::IsNullOrWhiteSpace($SerenaDirectory)
  if ($SkipSerena) {
    Write-Info "Serena setup was skipped by -SkipSerena."
  }
  elseif (-not $shouldConfigureSerena) {
    Write-Info "Serena is optional. Choose it if you want this local fork to provide Serena-backed LSP for an Unreal Engine project."
    $shouldConfigureSerena = Read-YesNo -Prompt "Configure Serena now" -DefaultYes:$false
  }

  $serenaConfigResult = $null
  if ($shouldConfigureSerena) {
    $serenaConfigResult = Configure-SerenaForProject -RepoRoot $repoRoot -RequestedProjectDirectory $ProjectDirectory -RequestedSerenaDirectory $SerenaDirectory -RequestedIndexParallelism $IndexParallelism -DryRunMode:$DryRun -AllowNonUnreal:$AllowNonUnrealProject
  }
  else {
    Write-Info "Serena setup skipped. You can rerun with -ConfigureSerena later."
  }

  Write-Section "Installation complete"
  if ($DryRun) {
    Write-Host "Dry run mode was enabled. No install commands or config files were changed." -ForegroundColor Yellow
  }
  Write-Host "The local fork install steps completed:" -ForegroundColor Green
  Write-Host "  - bun install"
  Write-Host "  - bun run build"
  Write-Host "  - npm link"
  Write-Host "  - compiled the host platform binary only"
  Write-Host "  - synced the host binary into the installed platform package"
  if ($configResult.Path) {
    Write-Host "  - OpenCode config: $($configResult.Action) -> $($configResult.Path)"
  }
  else {
    Write-Host "  - OpenCode config: skipped"
  }

  if ($serenaConfigResult) {
    Write-Host "  - Serena project config: $($serenaConfigResult.SerenaProjectConfigPath)"
  }
  else {
    Write-Host "  - Serena project config: skipped"
  }

  Write-Host ""
  Write-Host "Next steps:" -ForegroundColor Cyan
  Write-Host "  1. Reopen your terminal, then run: oh-my-opencode doctor"
  Write-Host "  2. If you skipped Serena and want it later, run:"
  Write-Host "     powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ConfigureSerena"
  Write-Host ""
  Write-Host "If OpenCode does not pick up the newly linked global package yet, reopen your terminal or verify PATH manually." -ForegroundColor Yellow
}
catch {
  Write-Host "" -ForegroundColor Red
  Write-Host "Installation failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
