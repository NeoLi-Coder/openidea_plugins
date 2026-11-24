param([ValidateSet('all','editor-tools','api-tools')][string]$Plugin='all',[switch]$SkipTests)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$oldCargo=$env:CARGO_HOME; $oldRustup=$env:RUSTUP_HOME
Push-Location $root
try {
  $cargo='cargo'
  if (Test-Path "$root/.tools/cargo/bin/cargo.exe") {
    $env:CARGO_HOME="$root/.tools/cargo"; $env:RUSTUP_HOME="$root/.tools/rustup"; $cargo="$env:CARGO_HOME/bin/cargo.exe"
  }
  $modules=if ($Plugin -eq 'all') { @('editor-tools','api-tools') } else { @($Plugin) }
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  foreach($name in $modules) {
    $dir=Join-Path $root "plugins/$name"
    if ($name -eq 'api-tools') {
      Push-Location $dir
      try {
        if (!$SkipTests) {
          node --test tools/history.test.mjs
          if ($LASTEXITCODE) {throw '请求历史测试失败'}
        }
        mvn -q -f scheduled-runtime/pom.xml '-Dmaven.test.skip=true' package
        if ($LASTEXITCODE) {throw '定时任务本地运行组件构建失败'}
        New-Item -Type Directory -Force dist | Out-Null
        Copy-Item -LiteralPath scheduled-runtime/target/neo-scheduled-runtime-1.0.0.jar -Destination dist/neo-scheduled-agent.jar
        node tools/bundle.mjs; if ($LASTEXITCODE) {throw '工作台前端构建失败'}
      } finally {Pop-Location}
    }
    if ($name -eq 'editor-tools' -and !$SkipTests) {
      & $cargo test --locked -p "neo-$name"; if ($LASTEXITCODE) {throw '编辑器工具测试失败'}
    }
    & $cargo build --locked --release -p "neo-$name" --target wasm32-wasip2
    if ($LASTEXITCODE) {throw "编译 $name 失败"}
    $wasm='neo_'+$name.Replace('-','_')+'.wasm'
    New-Item -Type Directory -Force "$dir/dist","$root/release" | Out-Null
    Copy-Item -LiteralPath "$root/target/wasm32-wasip2/release/$wasm" -Destination "$dir/dist/plugin.wasm"
    $version=(Select-String -Path "$dir/plugin.toml" -Pattern '^version = "([^"]+)"').Matches[0].Groups[1].Value
    $package="$root/release/neo.$name-$version.oiplugin"
    # 包完整关闭后再替换上次可用的同版本安装包。
    $staging="$package.tmp"
    $stream=[IO.File]::Create($staging)
    try {
      $zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
      try {
        $files=@('plugin.toml','dist/plugin.wasm','NOTICE','README.md','THIRD_PARTY_NOTICES.md')
        if ($name -eq 'editor-tools') {
          $files+=@('settings.schema.json','icons/copy-relative.svg','icons/copy-absolute.svg','icons/open-file.svg','icons/open-project.svg')
        }
        if ($name -eq 'api-tools') {$files+=@('icons/lightning.svg','dist/neo-scheduled-agent.jar')}
        foreach ($file in $files) {[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,"$dir/$file",$file) | Out-Null}
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,"$root/LICENSE",'LICENSE') | Out-Null
      } finally {$zip.Dispose()}
    } finally {$stream.Dispose()}
    if ([IO.File]::Exists($package)) {
      [IO.File]::Replace($staging,$package,[NullString]::Value)
    } else {
      [IO.File]::Move($staging,$package)
    }
    Write-Host "已构建：$package"
  }
} finally {$env:CARGO_HOME=$oldCargo; $env:RUSTUP_HOME=$oldRustup; Pop-Location}
