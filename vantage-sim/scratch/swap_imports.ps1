$files = @(
  'src/hooks/useVoiceCommand.ts',
  'src/hooks/useKeyboardControls.ts',
  'src/components/VoiceControls.tsx',
  'src/components/VoiceControlPanel.tsx',
  'src/components/PinControls.tsx',
  'src/components/KeyboardControls.tsx',
  'src/components/JoystickControls.tsx',
  'src/components/JoystickControl.tsx',
  'src/components/DashboardControls.tsx',
  'src/components/Dashboard.tsx',
  'src/components/DebugControls.tsx'
)
$base = 'e:/vs code projects/techathon-vin/Techathon-Vantage-Simulation/vantage-sim/'
foreach ($f in $files) {
  $path = $base + $f
  if (Test-Path $path) {
    $c = [System.IO.File]::ReadAllText($path)
    $n = $c.Replace('import { moveTo } from "@/lib/moveTo";', 'import { moveToSmooth as moveTo } from "@/lib/animateArm";')
    $n = $n.Replace('import { moveTo } from "../lib/moveTo";', 'import { moveToSmooth as moveTo } from "../lib/animateArm";')
    if ($n -ne $c) {
      [System.IO.File]::WriteAllText($path, $n)
      Write-Host "Updated: $f"
    }
  }
}
