import { useEffect, useState } from 'react'
import AreaLayout from '../components/AreaLayout.jsx'
import LibrarySetup from '../components/LibrarySetup.jsx'
import LibraryBrowser from '../components/LibraryBrowser.jsx'
import ScanImport from '../components/ScanImport.jsx'
import { CATEGORIES } from '../lib/fileTypes.js'
import { getGroups, addGroup, removeGroup, mergeGroups, safeName } from '../lib/groups.js'
import { getFavs } from '../lib/favorites.js'

const FILE_EXTS = [
  ...CATEGORIES.Document,
  ...CATEGORIES.Audio,
  ...CATEGORIES.Design,
  ...CATEGORIES.Archive
]

export default function FilesArea() {
  const [state, setState] = useState('checking')
  const [sub, setSub] = useState('')
  const [groups, setGroups] = useState(() => getGroups('files'))
  const [scanOpen, setScanOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const [fav, setFav] = useState(false)
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    window.api.library.ensure('files').then((c) => setState(c ? 'ready' : 'setup'))
  }, [])

  useEffect(() => {
    if (state !== 'ready') return
    window.api.library.counts('files').then(setCounts).catch(() => {})
  }, [state, reload])

  useEffect(() => {
    if (state === 'ready' && sub === '') {
      window.api.library
        .list('files', '')
        .then((res) => setGroups(mergeGroups('files', res.folders.map((f) => f.name))))
        .catch(() => {})
    }
  }, [state, sub, reload])

  async function createGroupNamed(name) {
    const n = safeName(name)
    if (!n) return
    await window.api.library.createGroup('files', n)
    setGroups(addGroup('files', n))
    setSub(`${n}/`)
  }

  async function deleteGroupNamed(name) {
    if (!window.confirm(`Delete group “${name}”? Files inside it will be removed.`)) return
    await window.api.library.removeGroup('files', name)
    setGroups(removeGroup('files', name))
    if (sub === `${name}/`) setSub('')
    setReload((r) => r + 1)
  }

  async function addFiles() {
    const picks = await window.api.pickFiles(FILE_EXTS)
    if (!picks?.length) return
    for (const p of picks) await window.api.library.import('files', fav ? '' : sub, p)
    setFav(false)
    setReload((r) => r + 1)
  }

  return (
    <AreaLayout
      brand="📁"
      title="Files"
      action={state === 'ready' ? { label: '＋ Add Files', onClick: addFiles } : undefined}
      nav={[
        {
          label: '📁 All Files',
          count: counts ? counts.total : undefined,
          active: !fav && sub === '',
          onClick: () => { setFav(false); setSub('') }
        },
        {
          label: '⭐ Favorites',
          count: getFavs('files').length,
          active: fav,
          onClick: () => setFav(true)
        }
      ]}
      groups={{
        area: 'files',
        onCreate: createGroupNamed,
        onDelete: deleteGroupNamed,
        onBulkDone: () => {
          setGroups(getGroups('files'))
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
            <LibrarySetup area="files" label="File Location" onReady={() => setState('ready')} />
          ) : (
            <div className="area-note">Loading…</div>
          )}
        </div>
      ) : (
        <LibraryBrowser
          area="files"
          label="Files"
          addExts={FILE_EXTS}
          sub={sub}
          setSub={setSub}
          reloadToken={reload}
          favMode={fav}
          onScan={() => setScanOpen(true)}
        />
      )}

      {scanOpen && (
        <ScanImport
          area="files"
          areaLabel="File Location"
          title="Scan Files"
          defaultCategories={['Document', 'Audio', 'Design', 'Archive']}
          prefix={sub}
          onClose={() => setScanOpen(false)}
          onDone={() => setReload((r) => r + 1)}
        />
      )}
    </AreaLayout>
  )
}
