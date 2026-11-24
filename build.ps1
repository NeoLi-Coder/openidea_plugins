param([switch]$SkipTests)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Push-Location $root
$oldCargoHome = $env:CARGO_HOME
$oldRustupHome = $env:RUSTUP_HOME
try {
    # 优先使用项目内工具链，不改用户或系统 PATH。
    if (Test-Path "$root/.tools/cargo/bin/cargo.exe") {
        $env:CARGO_HOME = "$root/.tools/cargo"
        $env:RUSTUP_HOME = "$root/.tools/rustup"
        $cargo = "$root/.tools/cargo/bin/cargo.exe"
    } else {
        $cargo = (Get-Command cargo -ErrorAction Stop).Source
    }
    if (-not $SkipTests) {
        & $cargo test --locked
        if ($LASTEXITCODE -ne 0) { throw '插件测试失败。' }
    }
    & $cargo build --locked --release --target wasm32-wasip2
    if ($LASTEXITCODE -ne 0) { throw 'WASM 构建失败。' }

    New-Item -ItemType Directory -Force "$root/dist", "$root/release" | Out-Null
    Copy-Item "$root/target/wasm32-wasip2/release/neo_editor_tools.wasm" "$root/dist/plugin.wasm"

    # 官方 .oiplugin 为 ZIP；此包供手动本地安装，不生成发布者密钥或签名。
    $version = (Select-String -Path "$root/plugin.toml" -Pattern '^version = "([^"]+)"$').Matches[0].Groups[1].Value
    $package = "$root/release/neo.editor-tools-$version.oiplugin"
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stream = [System.IO.File]::Open($package, [System.IO.FileMode]::Create)
    $zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($relative in @('plugin.toml', 'settings.schema.json', 'dist/plugin.wasm', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'README.md')) {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$root/$relative", $relative) | Out-Null
        }
    } finally {
        $zip.Dispose()
        $stream.Dispose()
    }
    Write-Host "已构建：$package"
} finally {
    $env:CARGO_HOME = $oldCargoHome
    $env:RUSTUP_HOME = $oldRustupHome
    Pop-Location
}
