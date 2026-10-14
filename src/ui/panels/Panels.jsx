import { useGameStore } from '../../store/gameStore'
import {
  CodesPanel,
  DailyPanel,
  GiftsPanel,
  JumpHeightPanel,
  RebirthPanel,
  SettingsPanel,
  TeleportPanel,
  WelcomePanel,
} from './PlayerPanels'
import { BootsPanel, ShopPanel, TrailsPanel } from './ShopPanels'

function renderPanel(id, me, props) {
  switch (id) {
    case 'boots':
      return <BootsPanel me={me} />
    case 'trails':
      return <TrailsPanel me={me} />
    case 'shop':
      return <ShopPanel me={me} props={props} />
    case 'rebirth':
      return <RebirthPanel me={me} />
    case 'gifts':
      return <GiftsPanel me={me} />
    case 'teleport':
      return <TeleportPanel me={me} />
    case 'codes':
      return <CodesPanel />
    case 'settings':
      return <SettingsPanel />
    case 'jumpHeight':
      return <JumpHeightPanel me={me} />
    case 'welcome':
      return <WelcomePanel />
    case 'daily':
      return <DailyPanel me={me} props={props} />
    default:
      return null
  }
}

/** Renders whichever window is open (one at a time, like Roblox UIs). */
export function Panels() {
  const panel = useGameStore((s) => s.panel)
  const me = useGameStore((s) => s.me)
  const phase = useGameStore((s) => s.phase)
  const death = useGameStore((s) => s.death)
  if (phase !== 'playing' || !me || death || !panel) return null
  return <div key={panel.id}>{renderPanel(panel.id, me, panel.props || {})}</div>
}

export default Panels
