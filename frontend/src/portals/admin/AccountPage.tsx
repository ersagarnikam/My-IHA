import { useAuth } from '../../auth/AuthContext'
import { SecurityTab } from '../doctor/settings/AccountSettingsPage'
import { Fact } from './DoctorPages'

/** The signed-in staff member's own account. */
export function AdminAccountPage() {
  const { user } = useAuth()
  return (
    <div className="dr-page">
      <h1 className="dr-title">My Account</h1>
      <section className="dr-card">
        <div className="dr-kv">
          <Fact label="Email" value={user?.email} />
          <Fact label="Role" value="MTA staff" />
        </div>
      </section>
      <SecurityTab />
    </div>
  )
}
