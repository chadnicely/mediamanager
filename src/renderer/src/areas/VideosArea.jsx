import { useEffect, useState } from 'react'
import AreaLayout from '../components/AreaLayout.jsx'
import LibrarySetup from '../components/LibrarySetup.jsx'
import LibraryBrowser from '../components/LibraryBrowser.jsx'
import ScanImport from '../components/ScanImport.jsx'
import { CATEGORIES } from '../lib/fileTypes.js'
import { getGroups, addGroup, removeGroup, mergeGroups, safeName } from '../lib/groups.js'
import { getFavs } from '../lib/favorites.js'

export default function VideosArea() {
  const [state, setState] = useState('checking')
  const [sub, setSub] = useState('')
  const [groups, setGroups] = useState(() => getGroups('videos'))
  const [scanOpen, setScanOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const [fav, setFav] = useState(false)
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    window.api.library.ensure('videos').then((c) => setState(c ? 'ready' : 'setup'))
  }, [])

  useEffect(() => {
    if (state !== 'ready') return
    window.api.library.counts('videos').then(setCounts).catch(() => {})
  }, [state, reload])

  useEffect(() => {
    if (state === 'ready' && sub === '') {
      window.api.library
        .list('videos', '')
        .then((res) => setGroups(mergeGroups('videos', res.folders.map((f) => f.name))))
        .catch(() => {})
    }
  }, [state, sub, reload])

  async function createGroupNamed(name) {
    const n = safeName(name)
    if (!n) return
    await window.api.library.createGroup('videos', n)
    setGroups(addGroup('videos', n))
    setSub(`${n}/`)
  }

  async function deleteGroupNamed(name) {
    if (!window.confirm(`Delete group “${name}”? Videos inside it will be removed.`)) return
    await window.api.library.removeGroup('videos', name)
    setGroups(removeGroup('videos', name))
    if (sub === `${name}/`) setSub('')
    setReload((r) => r + 1)
  }

  async function addVideos() {
    const picks = await window.api.pickFiles(CATEGORIES.Video)
    if (!picks?.length) return
    for (const p of picks) await window.api.library.import('videos', fav ? '' : sub, p)
    setFav(false)
    setReload((r) => r + 1)
  }

  return (
    <AreaLayout
      brand="🎬"
      title="Videos"
      action={state === 'ready' ? { label: '＋ Add Videos', onClick: addVideos } : undefined}
      nav={[
        {
          label: '🎬 All Videos',
          count: counts ? counts.total : undefined,
          active: !fav && sub === '',
          onClick: () => { setFav(false); setSub('') }
        },
        {
          label: '⭐ Favorites',
          count: getFavs('videos').length,
          active: fav,
          onClick: () => setFav(true)
        }
      ]}
      groups={{
        area: 'videos',
        onCreate: createGroupNamed,
        onDelete: deleteGroupNamed,
        onBulkDone: () => {
          setGroups(getGroups('videos'))
          setReload((r) => r + 1)
        },
        items: groups.map((name) => ({
          name,
          count: counts ? counts.groups[name] || 0 : undefined,
          active: !fav && sub === `${name}/`,
          onClick: () => { setFav(false); setSub(`${name}/`) }
        }))
      }}
    >
      {state !== 'ready' ? (
        <div className="area-body">
          {state === 'setup' ? (
            <LibrarySetup area="videos" label="Video Location" onReady={() => setState('ready')} />
          ) : (
            <div className="area-note">Loading…</div>
          )}
        </div>
      ) : (
        <LibraryBrowser
          area="videos"
          label="Videos"
          addExts={CATEGORIES.Video}
          sub={sub}
          setSub={setSub}
          reloadToken={reload}
          favMode={fav}
          onScan={() => setScanOpen(true)}
        />
      )}

      {scanOpen && (
        <ScanImport
          area="videos"
          areaLabel="Video Location"
          title="Scan Videos"
          defaultCategories={['Video']}
          prefix={sub}
          onClose={() => setScanOpen(false)}
          onDone={() => setReload((r) => r + 1)}
        />
      )}
    </AreaLayout>
  )
}
