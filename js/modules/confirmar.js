/**
 * Journey - Sistema de Confirmacao 10/10
 * Bypasses native confirm() bugs while maintaining project aesthetics.
 */
export function confirmar(mensagem, callback) {
    const modal = document.createElement('div');
    modal.id = 'dati-custom-confirm';

    // Glassmorphism Overlay
    Object.assign(modal.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '99999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(8px)',
        webkitBackdropFilter: 'blur(8px)',
        opacity: '0',
        transition: 'opacity 0.2s ease'
    });

    modal.innerHTML = `
        <div style="
            background: rgba(30, 41, 59, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 2rem;
            width: 90%;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            transform: scale(0.9);
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        ">
            <div style="
                width: 50px;
                height: 50px;
                background: rgba(239, 68, 68, 0.1);
                color: #ef4444;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 1.5rem;
                font-size: 1.5rem;
            ">
                <i class="ph ph-warning"></i>
            </div>
            
            <h3 style="color: #fff; font-size: 1.25rem; margin-bottom: 0.75rem; font-weight: 600;">Tem certeza?</h3>
            <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem;">${mensagem}</p>
            
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button id="btn-confirmar-nao" style="
                    flex: 1;
                    padding: 0.75rem;
                    border-radius: 8px;
                    border: 1px solid #334155;
                    background: transparent;
                    color: #fff;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                ">Não, cancelar</button>
                
                <button id="btn-confirmar-sim" style="
                    flex: 1;
                    padding: 0.75rem;
                    border-radius: 8px;
                    border: none;
                    background: #ef4444;
                    color: #fff;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">Sim, excluir</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Fade and Scale animation
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modal.firstElementChild.style.transform = 'scale(1)';
    });

    const close = (confirmed) => {
        modal.style.opacity = '0';
        modal.firstElementChild.style.transform = 'scale(0.9)';
        setTimeout(() => {
            modal.remove();
            if (confirmed && callback) callback();
        }, 200);
    };

    modal.querySelector('#btn-confirmar-sim').onclick = () => close(true);
    modal.querySelector('#btn-confirmar-nao').onclick = () => close(false);

    // Hover effects JS-style for strict isolation
    const buttons = modal.querySelectorAll('button');
    buttons.forEach(btn => {
        btn.onmouseover = () => btn.style.filter = 'brightness(1.1)';
        btn.onmouseout = () => btn.style.filter = 'brightness(1)';
    });
}
