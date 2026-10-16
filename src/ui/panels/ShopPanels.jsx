import { useState } from 'react'

import { sound } from '../../audio/sound'
import { localPlayer } from '../../game/playerState'
import { TRAILS, formatMult, formatNumber, parseList, trailOpen } from '../../shared/gameData.js'
import { getLayout } from '../../shared/layout.js'
import { gameState, useGameStore } from '../../store/gameStore'
import { useProgress } from '../../store/progression'
import { BootIcon } from '../icons'
import { Grid, Modal, OwnButton, Price } from './Modal'
import { action, purchase } from './actions'

/**
 * The Shop: one window, four tabs — Boots, Pets, Trails and Upgrades (Wins
 * Shop perks, passes and XP packs). Everything here is bought with Wins.
 * Every price, multiplier and state comes from the progression store; the
 * server checks again when you buy.
 */

const RAINBOW = 'linear-gradient(90deg, #ff3b3b, #ffb03b, #fff03b, #3bff6e, #3bb5ff, #a03bff)'

function goTo(point) {
  sound.click()
  localPlayer.teleportTo(point)
  gameState().closePanel()
}

const TABS = [
  { id: 'boots', label: 'Boots', icon: '🥾', color: '#2f9cf6', badge: 'boots' },
  { id: 'pets', label: 'Pets', icon: '🐾', color: '#5fbf3f', badge: 'pets' },
  { id: 'trails', label: 'Trails', icon: '✨', color: '#b45cff', badge: null },
  { id: 'upgrades', label: 'Upgrades', icon: '⬆️', color: '#ff9a1f', badge: 'shop' },
]
const SHOP_TABS = TABS.map((t) => t.id)

export function ShopPanel({ me, props }) {
  const [tab, setTab] = useState(SHOP_TABS.includes(props.tab) ? props.tab : 'boots')
  const badge = useProgress((s) => s.badge)
  const current = TABS.find((t) => t.id === tab)
  const tabs = (
    <div className="panel-tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`panel-tab press ${t.id === tab ? 'is-active' : ''}`}
          style={{ '--tab': t.color }}
          onClick={() => {
            sound.click()
            setTab(t.id)
          }}
        >
          <span className="text-[26px] leading-none">{t.icon}</span>
          <span className="game-text">{t.label}</span>
          {t.badge && badge === t.badge && <span className="tab-alert">!</span>}
        </button>
      ))}
    </div>
  )
  return (
    <Modal title="Shop" icon="🛒" color={current.color} width="min(1000px, 95vw)" tabs={tabs}>
      {tab === 'boots' && <BootsTab me={me} />}
      {tab === 'pets' && <PetsTab me={me} />}
      {tab === 'trails' && <TrailsTab me={me} />}
      {tab === 'upgrades' && <UpgradesTab me={me} highlight={props.highlight} />}
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Boots: bought in order; each pair is XP, run speed and two new stages
 * ------------------------------------------------------------------------- */

function BootsTab({ me }) {
  const hydraLeft = useGameStore((s) => s.hydraLeft)
  const boots = useProgress((s) => s.boots ?? [])
  const stand = getLayout().bootStands[0]
  return (
    <>
      <div className="ink-text mb-3 text-center text-[17px]">
        Every pair makes you <b>faster</b> (longer jumps!), multiplies the <b>XP</b> of every step and jump, and <b>opens two new stages</b>. Buy them in order.
      </div>
      <Grid min={200}>
        {boots.map((boot) => (
          <div key={boot.id} className={`card ${boot.state === 'equipped' ? 'is-equipped' : ''} ${boot.limited ? 'card-limited' : ''} ${boot.isNext ? 'is-highlight' : ''}`}>
            {boot.limited && <div className="chip bg-[#ff3f6c] text-white">LIMITED · {formatNumber(hydraLeft)}/{boot.limited} LEFT</div>}
            <BootIcon color={boot.color} accent={boot.accent} glow={boot.glow && boot.glow !== 'rainbow' ? boot.glow : undefined} size={78} />
            <div className="ink-text text-[19px] font-bold leading-tight">{boot.name}</div>
            <div className="game-text text-[24px] text-[#ffd23a]">x{formatNumber(boot.mult)} XP</div>
            <div className="ink-text text-[15px] font-bold">⚡ {boot.speed} speed</div>
            <div className="chip text-white" style={{ background: boot.stages ? '#2f8cff' : '#ff3f6c' }}>
              {boot.stages ? `Opens Stages ${boot.stages[0]}-${boot.stages[1]}` : 'The legendary flex'}
            </div>
            <OwnButton
              owned={boot.owned}
              equipped={boot.state === 'equipped'}
              price={boot.price}
              me={me}
              disabled={boot.state === 'soldout' || boot.state === 'locked'}
              label={boot.state === 'soldout' ? 'SOLD OUT' : '🔒 IN ORDER'}
              onBuy={purchase(me, boot.price, { cat: 'boot', id: boot.id })}
              onEquip={action('equip', { cat: 'boot', id: boot.id })}
            />
          </div>
        ))}
      </Grid>
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          className="btn-chunky btn-blue press game-text px-6 py-2 text-[22px]"
          onClick={() => goTo({ x: stand.pos[0] + 7, y: 0.2, z: stand.pos[2] - 4, yaw: -Math.PI / 2 })}
        >
          🌀 Go to the Boots gallery
        </button>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * Pets: eggs, your pets, equipping
 * ------------------------------------------------------------------------- */

function PetsTab({ me }) {
  const eggs = useProgress((s) => s.eggs ?? [])
  const pets = useProgress((s) => s.pets)
  const stand = getLayout().eggStands[0]
  if (!pets) return null
  const equippedCount = pets.equipped.length
  return (
    <>
      <div className="pets-head">
        <span className="game-text text-[22px]">
          Equipped {equippedCount}/{pets.slots} · {formatMult(pets.mult)} XP
        </span>
        <span className="ink-text text-[16px]">
          Bag {pets.count}/{pets.capacity}
        </span>
        <button type="button" className="btn-chunky btn-green press game-text px-5 py-1 text-[20px]" onClick={action('pet', { op: 'best' })}>
          EQUIP BEST
        </button>
      </div>
      {pets.list.length === 0 ? (
        <div className="card mb-4 px-5">
          <div className="ink-text text-[18px]">No pets yet! Hatch an egg below — pets follow you and multiply your XP.</div>
        </div>
      ) : (
        <Grid min={170}>
          {pets.list.map((pet) => (
            <div key={pet.id} className={`card pet-card ${pet.equipped ? 'is-equipped' : ''}`} style={{ '--rarity': pet.rarityColor }}>
              <span className="pet-face" style={{ background: pet.color, borderColor: pet.accent }}>
                <i />
                <i />
              </span>
              <div className="ink-text text-[17px] font-bold leading-tight">{pet.name}</div>
              <div className="chip text-white" style={{ background: pet.rarityColor }}>
                {pet.rarityName}
              </div>
              <div className="game-text text-[18px] text-[#3bd16b]">+{Math.round(pet.bonus * 100)}%</div>
              <div className="ink-text text-[13px]">
                ×{pet.owned} owned{pet.equipped ? ` · ${pet.equipped} on` : ''}
              </div>
              <div className="flex gap-1">
                {pet.equipped < pet.owned && (
                  <button type="button" className="btn-chunky btn-blue press game-text px-2 py-1 text-[14px]" onClick={action('pet', { op: 'equip', id: pet.id })}>
                    EQUIP
                  </button>
                )}
                {pet.equipped > 0 && (
                  <button type="button" className="btn-chunky btn-gray press game-text px-2 py-1 text-[14px]" onClick={action('pet', { op: 'unequip', id: pet.id })}>
                    OFF
                  </button>
                )}
                <button type="button" className="btn-chunky btn-red press game-text px-2 py-1 text-[14px]" title="Delete one" onClick={action('pet', { op: 'delete', id: pet.id })}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </Grid>
      )}
      <div className="game-text mb-2 mt-5 text-[24px]">Eggs</div>
      <Grid min={270}>
        {eggs.map((egg) => (
          <div key={egg.id} className={`card ${egg.open && egg.affordable ? 'is-highlight' : ''}`}>
            <div className="egg-icon" style={{ background: egg.color }} />
            <div className="ink-text text-[20px] font-bold">{egg.name}</div>
            <div className="egg-odds">
              {egg.odds.map((pet) => (
                <span key={pet.id} style={{ color: pet.rarity.color }} title={`${pet.name}: +${Math.round(pet.bonus * 100)}%`}>
                  {pet.name} {(pet.chance * 100).toFixed(pet.chance < 0.01 ? 2 : 1)}%
                </span>
              ))}
            </div>
            {egg.open ? (
              <button
                type="button"
                className={`btn-chunky ${egg.affordable ? 'btn-green' : 'btn-red'} press card-button game-text`}
                onClick={purchase(me, egg.price, { cat: 'egg', id: egg.id })}
              >
                <Price value={egg.price} />
              </button>
            ) : (
              <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
                🔒 {egg.rebirths} REBIRTH{egg.rebirths > 1 ? 'S' : ''}
              </button>
            )}
          </div>
        ))}
      </Grid>
      <div className="mt-4 flex justify-center">
        <button type="button" className="btn-chunky btn-blue press game-text px-6 py-2 text-[22px]" onClick={() => goTo({ x: stand.pos[0] + 12, y: 0.2, z: stand.pos[2] - 12, yaw: 0 })}>
          🌀 Go to the eggs
        </button>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * Trails: cosmetic; each one opens when you reach its stage
 * ------------------------------------------------------------------------- */

function swatch(colors) {
  if (colors.length > 3) return RAINBOW
  if (colors.length === 1) return `repeating-linear-gradient(135deg, ${colors[0]} 0 12px, #dfe7f3 12px 18px)`
  return `linear-gradient(90deg, ${colors.join(', ')})`
}

function TrailsTab({ me }) {
  const owned = parseList(me.trailsOwned)
  return (
    <>
      <div className="ink-text mb-3 text-center text-[17px]">The stripes you leave behind. Each one opens when you reach its stage — show everyone how far you got!</div>
      <Grid min={190}>
        {TRAILS.map((trail) => (
          <div key={trail.id} className={`card ${me.trail === trail.id ? 'is-equipped' : ''}`}>
            <div className={`trail-swatch ${trail.glow ? 'is-glow' : ''}`} style={{ background: swatch(trail.colors) }}>
              <span className="trail-chevrons">»»»</span>
            </div>
            <div className="ink-text text-[19px] font-bold">{trail.name}</div>
            <OwnButton
              owned={owned.includes(trail.id)}
              equipped={me.trail === trail.id}
              price={trail.price}
              me={me}
              disabled={!trailOpen(me, trail)}
              label={`🔒 STAGE ${trail.stage}`}
              onBuy={purchase(me, trail.price, { cat: 'trail', id: trail.id })}
              onEquip={action('equip', { cat: 'trail', id: trail.id })}
            />
          </div>
        ))}
      </Grid>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * Upgrades: permanent perks, passes and XP packs
 * ------------------------------------------------------------------------- */

const PASS_LOOKS = {
  pass2xJump: { icon: '⚡', text: 'Double the XP of every step and jump, forever.', bg: RAINBOW },
  pass2xWins: { icon: '🏆', text: 'Use the pink x2 Wins pads at the end of every stage.', bg: 'linear-gradient(90deg, #ff5fd2, #b45cff)' },
}

function UpgradesTab({ me, highlight }) {
  const perks = useProgress((s) => s.perks ?? [])
  const passes = useProgress((s) => s.passes ?? [])
  const packs = useProgress((s) => s.packs ?? [])
  return (
    <>
      <div className="game-text mb-2 text-[24px]">Upgrades</div>
      <div className="ink-text mb-3 text-[15px]">Permanent: they stay through every rebirth.</div>
      <Grid min={250}>
        {perks.map((perk) => (
          <div key={perk.id} className={`card ${perk.affordable ? 'is-highlight' : ''}`}>
            <div className="text-[46px] leading-none">{perk.icon}</div>
            <div className="ink-text text-[20px] font-bold">{perk.name}</div>
            <div className="ink-text text-[15px]">{perk.text}</div>
            <div className="perk-pips">
              {Array.from({ length: perk.max }, (_, i) => (
                <span key={i} className={i < perk.level ? 'is-on' : ''} />
              ))}
            </div>
            {perk.maxed ? (
              <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
                MAXED ✓
              </button>
            ) : (
              <button
                type="button"
                className={`btn-chunky ${perk.affordable ? 'btn-green' : 'btn-red'} press card-button game-text`}
                onClick={purchase(me, perk.price, { cat: 'perk', id: perk.id })}
              >
                <Price value={perk.price} />
              </button>
            )}
          </div>
        ))}
      </Grid>
      <div className="game-text mb-2 mt-5 text-[24px]">Passes</div>
      <Grid min={300}>
        {passes.map((pass) => {
          const look = PASS_LOOKS[pass.id]
          return (
            <div key={pass.id} className={`card ${pass.owned ? 'is-equipped' : ''} ${highlight === pass.id ? 'is-highlight' : ''}`}>
              <div className="pass-banner title-text" style={{ background: look.bg }}>
                {look.icon} {pass.name}
              </div>
              <div className="ink-text text-[17px]">{look.text}</div>
              {pass.owned ? (
                <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
                  OWNED ✓
                </button>
              ) : (
                <button
                  type="button"
                  className={`btn-chunky ${me.wins >= pass.price ? 'btn-green' : 'btn-red'} press card-button game-text`}
                  onClick={purchase(me, pass.price, { cat: 'product', id: pass.id })}
                >
                  <Price value={pass.price} />
                </button>
              )}
            </div>
          )
        })}
      </Grid>
      <div className="game-text mb-2 mt-5 text-[24px]">XP Packs</div>
      <div className="ink-text mb-2 text-[15px]">Minutes of training, with your multipliers, right now.</div>
      <Grid min={180}>
        {packs.map((pack) => (
          <div key={pack.id} className="card">
            <div className="text-[48px] leading-none">⭐</div>
            <div className="title-text text-[28px] text-[#ffd23a]">{pack.name}</div>
            <div className="ink-text text-[15px]">+{formatNumber(pack.xp)} XP</div>
            <button
              type="button"
              className={`btn-chunky ${me.wins >= pack.price ? 'btn-green' : 'btn-red'} press card-button game-text`}
              onClick={purchase(me, pack.price, { cat: 'product', id: pack.id })}
            >
              <Price value={pack.price} />
            </button>
          </div>
        ))}
      </Grid>
      <div className="card mt-5 items-start px-5 text-left">
        <div className="ink-text text-[19px] font-bold">How to get Wins 🏆</div>
        <div className="ink-text text-[16px]">
          Beat a stage and step on the yellow <b>Return</b> pad. Later stages pay much more, and every rebirth pays +50%! Gifts, the Free Chest and daily
          rewards give Wins too.
        </div>
      </div>
    </>
  )
}
