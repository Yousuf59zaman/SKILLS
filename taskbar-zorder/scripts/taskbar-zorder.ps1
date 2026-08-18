param(
    [ValidateSet('Status', 'DemoteTaskbar', 'LowerTaskbar', 'RestoreTaskbar', 'WatchDemoteTaskbar', 'KeepTaskbarLowered', 'PinForeground')]
    [string] $Mode = 'Status',

    [int] $IntervalMs = 100
)

$ErrorActionPreference = 'Stop'

$nativeType = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class TaskbarZOrderNative
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public const int GWL_EXSTYLE = -20;
    public const long WS_EX_TOPMOST = 0x00000008L;

    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
    public static readonly IntPtr HWND_BOTTOM = new IntPtr(1);

    public const UInt32 SWP_NOSIZE = 0x0001;
    public const UInt32 SWP_NOMOVE = 0x0002;
    public const UInt32 SWP_NOACTIVATE = 0x0010;
    public const UInt32 SWP_NOOWNERZORDER = 0x0200;
    public const UInt32 SWP_SHOWWINDOW = 0x0040;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int X,
        int Y,
        int cx,
        int cy,
        UInt32 uFlags);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    public static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

    public static long GetWindowLongPtr(IntPtr hWnd, int nIndex)
    {
        return IntPtr.Size == 8
            ? GetWindowLongPtr64(hWnd, nIndex).ToInt64()
            : GetWindowLong32(hWnd, nIndex);
    }
}
'@

if (-not ('TaskbarZOrderNative' -as [type])) {
    Add-Type $nativeType
}

function Get-WindowInfo {
    param([IntPtr] $Hwnd)

    $className = [Text.StringBuilder]::new(256)
    $title = [Text.StringBuilder]::new(512)
    [void] [TaskbarZOrderNative]::GetClassName($Hwnd, $className, $className.Capacity)
    [void] [TaskbarZOrderNative]::GetWindowText($Hwnd, $title, $title.Capacity)

    $rect = [TaskbarZOrderNative+RECT]::new()
    [void] [TaskbarZOrderNative]::GetWindowRect($Hwnd, [ref] $rect)

    [uint32] $windowPid = 0
    [void] [TaskbarZOrderNative]::GetWindowThreadProcessId($Hwnd, [ref] $windowPid)
    $processName = try {
        (Get-Process -Id $windowPid -ErrorAction Stop).ProcessName
    } catch {
        ''
    }

    $exStyle = [TaskbarZOrderNative]::GetWindowLongPtr($Hwnd, [TaskbarZOrderNative]::GWL_EXSTYLE)

    [pscustomobject] @{
        HWND     = ('0x{0:X}' -f $Hwnd.ToInt64())
        Class    = $className.ToString()
        Process  = $processName
        PID      = $windowPid
        Visible  = [TaskbarZOrderNative]::IsWindowVisible($Hwnd)
        Topmost  = (($exStyle -band [TaskbarZOrderNative]::WS_EX_TOPMOST) -ne 0)
        ExStyle  = ('0x{0:X}' -f $exStyle)
        Rect     = ('{0},{1},{2},{3}' -f $rect.Left, $rect.Top, $rect.Right, $rect.Bottom)
        Title    = $title.ToString()
        RawHwnd  = $Hwnd
    }
}

function Get-TaskbarWindows {
    $result = [Collections.Generic.List[IntPtr]]::new()
    $callback = [TaskbarZOrderNative+EnumWindowsProc] {
        param([IntPtr] $hwnd, [IntPtr] $lParam)

        $className = [Text.StringBuilder]::new(256)
        [void] [TaskbarZOrderNative]::GetClassName($hwnd, $className, $className.Capacity)
        if ($className.ToString() -in @('Shell_TrayWnd', 'Shell_SecondaryTrayWnd')) {
            $result.Add($hwnd)
        }

        return $true
    }

    [void] [TaskbarZOrderNative]::EnumWindows($callback, [IntPtr]::Zero)
    $result
}

function Set-TaskbarTopmostState {
    param([bool] $Topmost)

    $insertAfter = if ($Topmost) {
        [TaskbarZOrderNative]::HWND_TOPMOST
    } else {
        [TaskbarZOrderNative]::HWND_NOTOPMOST
    }

    $flags = [TaskbarZOrderNative]::SWP_NOMOVE -bor
        [TaskbarZOrderNative]::SWP_NOSIZE -bor
        [TaskbarZOrderNative]::SWP_NOACTIVATE -bor
        [TaskbarZOrderNative]::SWP_SHOWWINDOW

    foreach ($hwnd in Get-TaskbarWindows) {
        [void] [TaskbarZOrderNative]::SetWindowPos($hwnd, $insertAfter, 0, 0, 0, 0, $flags)
    }
}

function Set-TaskbarLowered {
    $flags = [TaskbarZOrderNative]::SWP_NOMOVE -bor
        [TaskbarZOrderNative]::SWP_NOSIZE -bor
        [TaskbarZOrderNative]::SWP_NOACTIVATE -bor
        [TaskbarZOrderNative]::SWP_NOOWNERZORDER -bor
        [TaskbarZOrderNative]::SWP_SHOWWINDOW

    foreach ($hwnd in Get-TaskbarWindows) {
        [void] [TaskbarZOrderNative]::SetWindowPos(
            $hwnd,
            [TaskbarZOrderNative]::HWND_NOTOPMOST,
            0,
            0,
            0,
            0,
            $flags)

        [void] [TaskbarZOrderNative]::SetWindowPos(
            $hwnd,
            [TaskbarZOrderNative]::HWND_BOTTOM,
            0,
            0,
            0,
            0,
            $flags)
    }
}

function Pin-ForegroundWindow {
    $hwnd = [TaskbarZOrderNative]::GetForegroundWindow()
    if ($hwnd -eq [IntPtr]::Zero) {
        throw 'No foreground window was found.'
    }

    $flags = [TaskbarZOrderNative]::SWP_NOMOVE -bor
        [TaskbarZOrderNative]::SWP_NOSIZE

    [void] [TaskbarZOrderNative]::SetWindowPos(
        $hwnd,
        [TaskbarZOrderNative]::HWND_TOPMOST,
        0,
        0,
        0,
        0,
        $flags)

    Get-WindowInfo $hwnd | Select-Object HWND, Class, Process, PID, Visible, Topmost, Rect, Title
}

switch ($Mode) {
    'Status' {
        Get-TaskbarWindows |
            ForEach-Object { Get-WindowInfo $_ } |
            Select-Object HWND, Class, Process, PID, Visible, Topmost, ExStyle, Rect, Title
    }
    'DemoteTaskbar' {
        Set-TaskbarTopmostState -Topmost:$false
        Get-TaskbarWindows |
            ForEach-Object { Get-WindowInfo $_ } |
            Select-Object HWND, Class, Process, PID, Visible, Topmost, ExStyle, Rect, Title
    }
    'LowerTaskbar' {
        Set-TaskbarLowered
        Get-TaskbarWindows |
            ForEach-Object { Get-WindowInfo $_ } |
            Select-Object HWND, Class, Process, PID, Visible, Topmost, ExStyle, Rect, Title
    }
    'RestoreTaskbar' {
        Set-TaskbarTopmostState -Topmost:$true
        Get-TaskbarWindows |
            ForEach-Object { Get-WindowInfo $_ } |
            Select-Object HWND, Class, Process, PID, Visible, Topmost, ExStyle, Rect, Title
    }
    'WatchDemoteTaskbar' {
        Write-Host 'Demoting taskbar repeatedly. Press Ctrl+C to stop. Run -Mode RestoreTaskbar afterward if needed.'
        while ($true) {
            Set-TaskbarTopmostState -Topmost:$false
            Start-Sleep -Milliseconds $IntervalMs
        }
    }
    'KeepTaskbarLowered' {
        Write-Host 'Keeping taskbar non-topmost and at bottom of Z-order. Press Ctrl+C to stop. Run -Mode RestoreTaskbar afterward if needed.'
        while ($true) {
            Set-TaskbarLowered
            Start-Sleep -Milliseconds $IntervalMs
        }
    }
    'PinForeground' {
        Pin-ForegroundWindow
    }
}
