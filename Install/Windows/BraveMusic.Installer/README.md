# Brave Music Windows Native Installer & Suite (WinUI 3 / Windows App SDK)

Provider: **Codemo Open Source Labs (COSL)**  
Repository: [https://github.com/codemolabs/Brave-Music](https://github.com/codemolabs/Brave-Music)  
Release: **v1.0.18**

---

## 1. Overview

This project provides the modern **Windows App SDK** and **WinUI 3** native installation suite for Brave Music. It is built adhering to the Microsoft Fluent Design System and [microsoft-ui-xaml](https://github.com/microsoft/microsoft-ui-xaml) architecture.

### Key Capabilities:
- **WinUI 3 Mica Backdrop**: Native Windows 11 dynamic material surface.
- **Shows Downloading Suite**: Real-time progress bar, throughput metrics, and status badges.
- **PackageDeploymentManager Integration**: Onboards packages via `PackageDeploymentManager.AddPackageByUriAsync`.
- **Zero Telemetry**: Operates 100% locally on the user's machine without external analytics or data collection.

---

## 2. Windows-Only Architecture Notice

WinUI 3 and the Windows App SDK are **Windows-only technologies** built on Windows 10/11 APIs. Compiling and running this native C# suite requires a Windows 10 (version 1809+) or Windows 11 environment.

To test controls, design patterns, and app lifecycle, explore:
- **WinUI 3 Gallery**: Interactive showcase for controls, styles, and Fluent design patterns.
- **WindowsAppSDK-Samples**: Practical code examples covering WinUI 3, windowing, and deployment.

---

## 3. Microsoft winapp CLI

Manage SDKs, generate code projections, and build signed MSIX packages using Microsoft's open-source `winapp` CLI:

```powershell
# Install winapp CLI via winget
winget install Microsoft.winappcli --source winget

# Build and package application
winapp build
winapp package
```

---

## 4. Architectural Patterns & Critical Rules

### 1. PackageDeploymentManager Onboarding
Unpackaged onboarding flows use `PackageDeploymentManager.GetDefault().AddPackageByUriAsync`:

```csharp
var deploymentManager = PackageDeploymentManager.GetDefault();
var packageUri = new Uri("https://github.com/codemoteams/Brave-Music/releases/download/v1.0.18/BraveMusic-1.0.18.msix");
var options = new AddPackageOptions();

var result = await deploymentManager.AddPackageByUriAsync(packageUri, options);
if (result.Status != PackageDeploymentStatus.CompletedSuccess)
{
    // Handle error...
}
```

### 2. WinUI 3 ContentDialog XamlRoot Requirement
When displaying error dialogs or confirmations in WinUI 3, you **must set the `XamlRoot` property** before calling `ShowAsync()`:

```csharp
var errorDialog = new ContentDialog
{
    Title = "Installation Notice",
    Content = $"Failed to deploy package: {ex.Message}",
    CloseButtonText = "OK",
    // CRITICAL: WinUI 3 throws InvalidOperationException if XamlRoot is not associated
    XamlRoot = this.Content.XamlRoot
};

await errorDialog.ShowAsync();
```

Failing to set `XamlRoot` throws `System.InvalidOperationException` because WinUI 3 requires dialogs to be attached to a live visual tree.

---

## 5. Direct Executable & Portable Suite

For immediate deployment without MSIX installation, run `brave-music.exe` directly from the release package. All dependencies (`yt-dlp.exe`, CastLabs Widevine CDM, and local runtime) are bundled self-contained.

