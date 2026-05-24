import { Alert, Snackbar } from '@mui/material'
import { useViewerStore } from '../../app/store/viewerSlice'

const SNACKBAR_DURATION_MS = 4_000

export default function AppSnackbar() {
    const { notification, clearNotification } = useViewerStore()

    return (
        <Snackbar
            open={Boolean(notification)}
            autoHideDuration={SNACKBAR_DURATION_MS}
            onClose={clearNotification}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
            <Alert
                severity={notification?.severity ?? 'info'}
                onClose={clearNotification}
                variant="filled"
            >
                {notification?.message}
            </Alert>
        </Snackbar>
    )
}
