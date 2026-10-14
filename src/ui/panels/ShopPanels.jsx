import { sound } from '../../audio/sound'
import { localPlayer } from '../../game/playerState'
import { BOOTS, PRODUCTS, TRAILS, formatNumber, parseList } from '../../shared/gameData.js'
import { getLayout } from '../../shared/layout.js'
import { gameState, useGameStore } from '../../store/gameStore'
import { BootIcon } from '../icons'
import { Grid, Modal, OwnButton, Price } from './Modal'
import { action, purchase } from './actions'

const RAINBOW = 'linear-gradient(90deg, #ff3b3b, #ffb03b, #fff03b, #3bff6e, #3bb5ff, #a03bff)'

/* ---------------------------------------------------------------------------
 * Boots
 * ------------------------------------------------------------------------- */

function goToBoots() {
  sound.click()
  const stand = getLayout().bootStands[0]
  localPlayer.teleportTo({ x: stand.pos[0] + 7, y: 0.2, z: stand.pos[2] - 4, yaw: -Math.PI / 2 })
  gameState().closePanel()
}

export function BootsPanel({ me }) {
  const hydraLeft = useGameStore((s) => s.hydraLeft)
  const owned = parseList(me.bootsOwned)
  return (
    <Modal title="Boots" icon="🥾" color="#2f9cf6" width="min(980px, 95vw)">
      <div className="ink-text mb-3 text-center text-[17px]">Boots give you Jump every second you play, and make you run faster and jump higher.</div>
      <Grid min={200}>
        {BOOTS.map((boot) => {
          const isOwned = owned.includes(boot.id)
          const soldOut = boot.limited && hydraLeft <= 0 && !isOwned
          return (
            <div key={boot.id} className={`card ${me.boot === boot.id ? 'is-equipped' : ''} ${boot.limited ? 'card-limited' : ''}`}>
              {boot.limited && <div className="chip bg-[#ff3f6c] text-white">LIMITED · {formatNumber(hydraLeft)}/{boot.limited} LEFT</div>}
              <BootIcon color={boot.color} accent={boot.accent} glow={boot.glow && boot.glow !== 'rainbow' ? boot.glow : undefined} size={78} />
              <div className="ink-text text-[19px] font-bold leading-tight">{boot.name}</div>
              <div className="game-text text-[24px] text-[#ffd23a]">+{formatNumber(boot.rate)} Jump/s</div>
              <div className="ink-text text-[14px] leading-tight opacity-80">
                +{boot.speed} Speed · +{boot.height} Jump Height
              </div>
              <OwnButton
                owned={isOwned}
                equipped={me.boot === boot.id}
                price={boot.price}
                me={me}
                disabled={soldOut}
                label="SOLD OUT"
                onBuy={purchase(me, boot.price, { cat: 'boot', id: boot.id })}
                onEquip={action('equip', { cat: 'boot', id: boot.id })}
              />
            </div>
          )
        })}
      </Grid>
      <div className="mt-4 flex justify-center">
        <button type="button" className="btn-chunky btn-blue press game-text px-6 py-2 text-[22px]" onClick={goToBoots}>
          🌀 Go to the Boots shop
        </button>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Trails
 * ------------------------------------------------------------------------- */

function swatch(colors) {
  if (colors.length > 3) return RAINBOW
  if (colors.length === 1) return `repeating-linear-gradient(135deg, ${colors[0]} 0 12px, #dfe7f3 12px 18px)`
  return `linear-gradient(90deg, ${colors.join(', ')})`
}

export function TrailsPanel({ me }) {
  const owned = parseList(me.trailsOwned)
  return (
    <Modal title="Trails" icon="✨" color="#b45cff" width="min(900px, 95vw)">
      <div className="ink-text mb-3 text-center text-[17px]">The stripes you leave behind when you run and jump. Better trails add Jump!</div>
      <Grid min={190}>
        {TRAILS.map((trail) => (
          <div key={trail.id} className={`card ${me.trail === trail.id ? 'is-equipped' : ''}`}>
            <div className={`trail-swatch ${trail.glow ? 'is-glow' : ''}`} style={{ background: swatch(trail.colors) }}>
              <span className="trail-chevrons">»»»</span>
            </div>
            <div className="ink-text text-[19px] font-bold">{trail.name}</div>
            <div className="chip bg-[#e6ffe9] text-[#1d7a2f]">{trail.bonus ? `+${Math.round(trail.bonus * 100)}% Jump` : 'Free'}</div>
            <OwnButton
              owned={owned.includes(trail.id)}
              equipped={me.trail === trail.id}
              price={trail.price}
              me={me}
              onBuy={purchase(me, trail.price, { cat: 'trail', id: trail.id })}
              onEquip={action('equip', { cat: 'trail', id: trail.id })}
            />
          </div>
        ))}
      </Grid>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Shop: passes and Jump packs
 * ------------------------------------------------------------------------- */

const PASSES = [
  { id: 'pass2xJump', icon: '⚡', text: 'Double every Jump you gain, forever.', bg: RAINBOW },
  { id: 'pass2xWins', icon: '🏆', text: 'Use the pink x2 Wins pads at the end of every stage.', bg: 'linear-gradient(90deg, #ff5fd2, #b45cff)' },
]

const PACKS = ['jump10k', 'jump100k', 'jump1m', 'jump10m']

export function ShopPanel({ me, props }) {
  return (
    <Modal title="Shop" icon="🛒" color="#ff9a1f" width="min(860px, 95vw)">
      <div className="game-text mb-2 text-[24px]">Passes</div>
      <Grid min={300}>
        {PASSES.map((pass) => {
          const product = PRODUCTS[pass.id]
          const owned = me[pass.id]
          return (
            <div key={pass.id} className={`card ${owned ? 'is-equipped' : ''} ${props.highlight === pass.id ? 'is-highlight' : ''}`}>
              <div className="pass-banner title-text" style={{ background: pass.bg }}>
                {pass.icon} {product.name}
              </div>
              <div className="ink-text text-[17px]">{pass.text}</div>
              {owned ? (
                <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
                  OWNED ✓
                </button>
              ) : (
                <button
                  type="button"
                  className={`btn-chunky ${me.wins >= product.price ? 'btn-green' : 'btn-red'} press card-button game-text`}
                  onClick={purchase(me, product.price, { cat: 'product', id: pass.id })}
                >
                  <Price value={product.price} />
                </button>
              )}
            </div>
          )
        })}
      </Grid>
      <div className="game-text mb-2 mt-5 text-[24px]">Jump Packs</div>
      <Grid min={180}>
        {PACKS.map((id) => {
          const product = PRODUCTS[id]
          return (
            <div key={id} className="card">
              <div className="text-[48px] leading-none">⭐</div>
              <div className="title-text text-[30px] text-[#ffd23a]">{product.name}</div>
              <button
                type="button"
                className={`btn-chunky ${me.wins >= product.price ? 'btn-green' : 'btn-red'} press card-button game-text`}
                onClick={purchase(me, product.price, { cat: 'product', id })}
              >
                <Price value={product.price} />
              </button>
            </div>
          )
        })}
      </Grid>
      <div className="card mt-5 items-start px-5 text-left">
        <div className="ink-text text-[19px] font-bold">How to get Wins 🏆</div>
        <div className="ink-text text-[16px]">
          Beat a stage and step on the yellow <b>Return</b> pad. Later stages pay much more! Gifts, the Free Chest, daily rewards and goals give Wins too.
        </div>
      </div>
    </Modal>
  )
}
