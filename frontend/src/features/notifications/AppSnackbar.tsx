import { Alert, Snackbar } from '@mui/material'
import { useViewerStore } from '../../app/store/viewerSlice'

export default function AppSnackbar() {
    const { notification, clearNotification } = useViewerStore()

    return (
        <Snackbar
            open={Boolean(notification)}
            autoHideDuration={4000}
            onClose={clearNotification}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
            <Alert severity={notification?.severity ?? 'info'} onClose={clearNotification} variant="filled">
                {notification?.message}
            </Alert>
        </Snackbar>
    )
}
