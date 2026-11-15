import { SHORTCUTS } from '../../app/useKeyboardShortcuts'
import { Modal } from '../../shared/ui/Modal'
import styles from './ShortcutsDialog.module.css'

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" width={420} onClose={onClose}>
      <dl className={styles.list}>
        {SHORTCUTS.map(({ keys, label }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {keys.map((key) => (
                <kbd key={key} className="kbd">
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
