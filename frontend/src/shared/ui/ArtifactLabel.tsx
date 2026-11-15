import { artifactName } from '../lib/format'
import styles from './ArtifactLabel.module.css'

interface Props {
  reference: string | null | undefined
  fallback?: string
}

/** A dataset or policy name that truncates its run name but keeps the checkpoint step visible. */
export function ArtifactLabel({ reference, fallback = '' }: Props) {
  const { name, step } = artifactName(reference)
  return (
    <span className={styles.label} title={reference ?? undefined}>
      <span className={styles.name}>{name || fallback}</span>
      {step && <span className={`${styles.step} mono`}>@{step}</span>}
    </span>
  )
}
