import { createTheme, responsiveFontSizes } from '@mui/material/styles';

let theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#1C39BB', // Persian Blue
            light: '#4f6bff', // Lighter Blue
            contrastText: '#ffffff',
        },
        secondary: {
            main: '#f50057', // Accent Pink
        },
        background: {
            default: '#F0F4FF', // Light blueish tint (replaces the light orange)
            paper: '#FFFFFF',
        },
        text: {
            primary: '#111827', // Almost black (Sharper)
            secondary: '#6B7280', // Cool gray text
        },
    },
    typography: {
        fontFamily: '"Inter", "sans-serif"',
        h4: { fontWeight: 700, letterSpacing: '-0.5px' },
        h5: { fontWeight: 700, letterSpacing: '-0.5px' },
        h6: { fontWeight: 600, letterSpacing: '-0.25px' },
        button: { fontWeight: 600, textTransform: 'none', letterSpacing: '0.2px' },
    },
    shape: {
        borderRadius: 16, // Modern "Card" rounded corners
    },
    components: {
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none', // Remove default MUI overlay
                    boxShadow: '0px 4px 20px rgba(28, 57, 187, 0.08)', // Soft blue-tinted shadow
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    padding: '12px 24px',
                    boxShadow: 'none',
                },
            },
        },
        MuiMenu: {
            styleOverrides: {
                list: {
                    paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    paddingBottom: 'env(safe-area-inset-bottom)',
                },
            },
        },
    },
});

theme = responsiveFontSizes(theme);

export default theme;
