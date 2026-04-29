import { useEffect, useRef } from 'react';

import { useOctStore } from '../../app/store/octSlice';

export default function OverlayCanvas() {
    const { overlayMask } = useOctStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !overlayMask) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 0.5;
            ctx.drawImage(img, 0, 0);
        };
        img.src = `data:image/png;base64,${overlayMask}`;
    }, [overlayMask]);

    if (!overlayMask) return null;

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
        />
    );
}
