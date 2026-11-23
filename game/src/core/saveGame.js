// Saving and loading: three manual slots and an autosave in the browser's localStorage. A save
// holds where the player is, the clock, and whatever each system hands over through serialize()
// (money and rank, finished jobs, the cover meter, weapons, owned property, collected falcons).

/** Build game.save: save(slot), load(slot), listSlots(), hasAny(), the autosave and the stored settings. */
export function createSaveGame(game) {
  const save = {
    slots: SAVE_SLOTS,
    /** Write the current game into a slot; returns whether it worked. */
    save(slot = 'auto') {
      const player = game.player;
      if (!player || !player.character || player.state === 'down') return false;
      const pos = player.pos;
      const data = {
        version: game.config.saveVersion || 1,
        savedAt: Date.now(),
        hour: game.time.hour,
        player: {
          x: pos.x, z: pos.z, heading: player.heading,
          health: player.character.health, armor: player.character.armor,
          vehicle: player.vehicle ? { spec: player.vehicle.spec.id, color: player.vehicle.color, health: player.vehicle.health, owned: !!player.vehicle.tags.owned } : null,
        },
        summary: summarize(),
        systems: {},
      };
      for (const name of SAVED_SYSTEMS) {
        const system = game[name];
        if (system && system.serialize) {
          try {
            data.systems[name] = system.serialize();
          } catch (error) {
            console.warn(`save: ${name} could not be saved`, error);
          }
        }
      }
      try {
        localStorage.setItem(STORAGE_PREFIX + slot, JSON.stringify(data));
      } catch (error) {
        return false;
      }
      if (slot !== 'auto') {
        game.events.emit('notify', { text: 'Game saved', kind: 'good' });
        game.audio?.play?.('save');
      }
      game.events.emit('save:written', { slot });
      return true;
    },

    /** Read a slot's data without applying it, or null. */
    read(slot) {
      try {
        const text = localStorage.getItem(STORAGE_PREFIX + slot);
        if (!text) return null;
        const data = JSON.parse(text);
        return data && data.player ? data : null;
      } catch (error) {
        return null;
      }
    },

    /** Restore a slot into the running world; returns whether it worked. */
    load(slot = 'auto') {
      const data = save.read(slot);
      if (!data) return false;
      game.events.emit('save:loading', { slot });
      game.missions?.abort?.('load');
      game.wanted?.clear?.();
      for (const name of SAVED_SYSTEMS) {
        const system = game[name];
        if (system && system.deserialize && data.systems[name] !== undefined) {
          try {
            system.deserialize(data.systems[name]);
          } catch (error) {
            console.warn(`save: ${name} could not be restored`, error);
          }
        }
      }
      game.time.hour = data.hour;
      const player = game.player;
      player.teleport(data.player.x, data.player.z, data.player.heading);
      player.character.health = Math.max(30, data.player.health || 100);
      player.character.armor = data.player.armor || 0;
      player.character.alive = true;
      if (data.player.vehicle && game.vehicles) {
        const vehicle = game.vehicles.spawn(data.player.vehicle.spec, { x: data.player.x, z: data.player.z, heading: data.player.heading, color: data.player.vehicle.color });
        if (vehicle) {
          vehicle.health = Math.max(vehicle.spec.health * 0.4, data.player.vehicle.health || vehicle.spec.health);
          vehicle.tags.owned = data.player.vehicle.owned;
          vehicle.tags.stolen = !data.player.vehicle.owned;
          player.putInVehicle(vehicle);
        }
      }
      game.events.emit('save:loaded', { slot });
      return true;
    },

    erase(slot) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + slot);
      } catch (error) {
        /* storage unavailable: nothing to erase */
      }
    },

    /** True when any slot holds a game. */
    hasAny: () => SAVE_SLOTS.some((slot) => save.read(slot) !== null),

    /** The newest slot's name, or null. */
    latest() {
      let best = null;
      let newest = 0;
      for (const slot of SAVE_SLOTS) {
        const data = save.read(slot);
        if (data && data.savedAt > newest) {
          newest = data.savedAt;
          best = slot;
        }
      }
      return best;
    },

    /** For the menus: [{slot, exists, label, detail}]. */
    listSlots() {
      return SAVE_SLOTS.map((slot) => {
        const data = save.read(slot);
        const label = slot === 'auto' ? 'Autosave' : `Slot ${slot.slice(-1)}`;
        if (!data) return { slot, exists: false, label, detail: 'Empty' };
        const s = data.summary || {};
        const when = new Date(data.savedAt);
        const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
        return { slot, exists: true, label, detail: `${s.rankName || 'Nobody'} · $${(s.money || 0).toLocaleString('en-US')} · ${s.jobs || 0}/${s.jobsTotal || 10} jobs · ${s.district || 'Port Sarab'} · ${stamp}` };
      });
    },

    /** Keep the player's settings (volumes, mouse, quality) between visits. */
    saveSettings() {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(game.settings));
      } catch (error) {
        /* storage unavailable */
      }
    },
    loadSettings() {
      try {
        const text = localStorage.getItem(SETTINGS_KEY);
        if (text) Object.assign(game.settings, JSON.parse(text));
      } catch (error) {
        /* keep the defaults */
      }
    },
  };

  function summarize() {
    const pos = game.player.pos;
    return {
      money: game.economy ? game.economy.money : 0,
      rankName: game.economy ? game.economy.rankName : 'Nobody',
      jobs: game.missions ? game.missions.completedCount : 0,
      jobsTotal: game.missions ? game.missions.total : 10,
      district: game.city.districtAt(pos.x, pos.z).name,
    };
  }

  // Autosave after every finished job and whenever the player sleeps or buys property.
  game.events.on('mission:completed', () => setTimeout(() => save.save('auto'), 6000));
  game.events.on('safehouse:saved', () => save.save('auto'));
  game.events.on('menu:save', (event) => save.save(event.slot));
  game.events.on('settings:changed', () => save.saveSettings());
  save.loadSettings();
  return save;
}

const STORAGE_PREFIX = 'khamsin-port-sarab-save-';
const SETTINGS_KEY = 'khamsin-port-sarab-settings';
const SAVE_SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];
/** The systems asked for their progress, in the order they are restored. */
const SAVED_SYSTEMS = ['economy', 'story', 'missions', 'activities', 'safehouses', 'weapons', 'wanted'];
