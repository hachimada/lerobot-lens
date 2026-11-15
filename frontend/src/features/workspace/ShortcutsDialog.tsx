import { Modal } from '../../shared/ui/Modal'
import { SHORTCUTS } from './shortcuts'
import styles from './ShortcutsDialog.module.css'

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" width={420} onClose={onClose}>
      <dl className={styles.list}>
        {SHORTCUTS.map(({ label, bindings }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {bindings.map(({ action, hint }) => (
                <kbd key={action} className="kbd">
                  {hint}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
