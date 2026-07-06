import { useEffect, useState } from 'react'
import AreaLayout from '../components/AreaLayout.jsx'
import LibrarySetup from '../components/LibrarySetup.jsx'
import ImageGallery from '../components/ImageGallery.jsx'
import ScanImport from '../components/ScanImport.jsx'
import { CATEGORIES } from '../lib/fileTypes.js'
import { getGroups, addGroup, removeGroup, syncGroups, safeName } from '../lib/groups.js'
import { getFavs } from '../lib/favorites.js'

export default function ImagesArea() {
  const [state, setState] = useState('checking') // checking | setup | ready
  const [sub, setSub] = useState('')
  const [groups, setGroups] = useState(() => getGroups('images'))
  const [scanOpen, setScanOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const [fav, setFav] = useState(false)
  const [counts, setCounts] = useState(null) // { total, root, groups }

  useEffect(() => {
    window.api.library.ensure('images').then((c) => setState(c ? 'ready' : 'setup'))
  }, [])

  // Sidebar badges: how many images live in each group (and in total).
  useEffect(() => {
    if (state !== 'ready') return
    window.api.library.counts('images').then(setCounts).catch(() => {})
  }, [state, reload])

  // Keep sidebar groups in sync with the bucket's top-level folders.
  useEffect(() => {
    if (state === 'ready' && sub === '') {
      window.api.library
        .list('images', '')
        .then((res) => setGroups(syncGroups('images', res.folders.map((f) => f.name))))
        .catch(() => {})
    }
  }, [state, sub, reload])

  async function createGroupNamed(name) {
    const n = safeName(name)
    if (!n) return
    await window.api.library.createGroup('images', n)
    setGroups(addGroup('images', n))
    setSub(`${n}/`)
  }

  async function deleteGroupNamed(name) {
    if (!window.confirm(`Delete group “${name}”? Images inside it will be removed.`)) return
    await window.api.library.removeGroup('images', name)
    setGroups(removeGroup('images', name))
    if (sub === `${name}/`) setSub('')
    setReload((r) => r + 1)
  }

  async function addImages() {
    const picks = await window.api.pickFiles(CATEGORIES.Image)
    if (!picks?.length) return
    for (const p of picks) await window.api.library.import('images', fav ? '' : sub, p)
    setFav(false)
    setReload((r) => r + 1)
  }

  return (
    <AreaLayout
      brand="🖼"
      title="Images"
      action={state === 'ready' ? { label: '＋ Add Images', onClick: addImages } : undefined}
      nav={[
        {
          label: '🖼 All Images',
          count: counts ? counts.total : undefined,
          active: !fav && sub === '',
          onClick: () => { setFav(false); setSub('') }
        },
        {
          label: '⭐ Favorites',
          count: getFavs('images').length,
          active: fav,
          onClick: () => setFav(true)
        }
      ]}
      groups={{
        area: 'images',
        onCreate: createGroupNamed,
        onDelete: deleteGroupNamed,
        onBulkDone: () => {
          setGroups(getGroups('images'))
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
            <LibrarySetup area="images" label="Image Location" onReady={() => setState('ready')} />
          ) : (
            <div className="area-note">Loading…</div>
          )}
        </div>
      ) : (
        <ImageGallery
          sub={sub}
          setSub={setSub}
          reloadToken={reload}
          favMode={fav}
          onScan={() => setScanOpen(true)}
        />
      )}

      {scanOpen && (
        <ScanImport
          area="images"
          areaLabel="Image Location"
          title="Scan Images"
          defaultCategories={['Image']}
          prefix={sub}
          onClose={() => setScanOpen(false)}
          onDone={() => setReload((r) => r + 1)}
        />
      )}
    </AreaLayout>
  )
}
