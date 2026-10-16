import { useGameStore } from '../../store/gameStore'
import {
  DailyPanel,
  GiftsPanel,
  HatchPanel,
  JumpHeightPanel,
  OfflinePanel,
  RebirthPanel,
  SettingsPanel,
  TeleportPanel,
  WelcomePanel,
} from './PlayerPanels'
import { ShopPanel } from './ShopPanels'

/** Old window ids that are now tabs of the Shop. */
const SHOP_ALIASES = { boots: 'boots', pets: 'pets', trails: 'trails', winsShop: 'upgrades' }

function renderPanel(id, me, props) {
  // Keyed by the tab asked for, so opening the Shop on another tab while it's open switches to it.
  if (SHOP_ALIASES[id]) return <ShopPanel key={SHOP_ALIASES[id]} me={me} props={{ ...props, tab: SHOP_ALIASES[id] }} />
  switch (id) {
    case 'shop':
      return <ShopPanel key={props.tab ?? 'boots'} me={me} props={props} />
    case 'rebirth':
      return <RebirthPanel />
    case 'gifts':
      return <GiftsPanel me={me} />
    case 'teleport':
      return <TeleportPanel me={me} />
    case 'settings':
      return <SettingsPanel />
    case 'jumpHeight':
      return <JumpHeightPanel />
    case 'welcome':
      return <WelcomePanel />
    case 'daily':
      return <DailyPanel props={props} />
    case 'offline':
      return <OfflinePanel props={props} />
    case 'hatch':
      return <HatchPanel props={props} />
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
  return <div key={`${panel.id}:${panel.props?.at ?? ''}`}>{renderPanel(panel.id, me, panel.props || {})}</div>
}

export default Panels
