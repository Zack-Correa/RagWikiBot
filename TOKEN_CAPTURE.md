# 🔐 Captura Automática de Token SSO

## Arquitetura

```
  Windows (sua máquina)              Linux (servidor do bot)
  ┌────────────┐   hosts file       ┌─────────────────────┐
  │  ragexe.exe │───────────────────>│  Token Capture Proxy │
  │  (jogo RO)  │  aponta p/ Linux  │  0.0.0.0:6900       │
  └────────────┘                    │                     │
                                    │ ✅ Captura 0x0825   │
                                    │ ✅ Salva .env       │
                                    │                     │
                                    │    ┌──────────────┐ │
                                    │───>│ Servidor Real │ │
                                    │<───│ GNJoy LATAM  │ │
                                    │    └──────────────┘ │
                                    └─────────────────────┘
```

O proxy é **100% transparente**: o jogo funciona normalmente, e o token é
capturado automaticamente quando você faz login.

## Configuração

### 1. No Linux (uma vez)

```bash
# O bot já inclui o proxy. Basta iniciar:
node app.js

# Ou rodar o proxy standalone:
sudo node scripts/start-token-capture.js
```

> **Nota:** A porta 6900 requer `sudo` no Linux. Alternativa: use `setcap`
> para dar permissão ao node:
> ```bash
> sudo setcap 'cap_net_bind_service=+ep' $(which node)
> ```

### 2. No Windows (uma vez)

1. Abrir **Bloco de Notas como Administrador**
2. Abrir o arquivo: `C:\Windows\System32\drivers\etc\hosts`
3. Adicionar no final:
   ```
   192.168.1.XXX  lt-account-01.gnjoylatam.com
   ```
   *(Substitua `192.168.1.XXX` pelo IP do servidor Linux)*
4. Salvar e fechar

### 3. Jogar

1. Abrir Ragnarok Online normalmente
2. Fazer login com usuário, senha e OTP
3. O token é capturado automaticamente
4. O bot usa o token para consultar o player count

## Comandos Discord

| Comando | Descrição |
|---------|-----------|
| `/token-capture start` | Inicia o proxy de captura |
| `/token-capture stop` | Para o proxy |
| `/token-capture status` | Mostra status, conexões e último token |

## Como Funciona

1. O Windows resolve `lt-account-01.gnjoylatam.com` para o IP do Linux (via hosts file)
2. O jogo conecta ao proxy no Linux na porta 6900
3. O proxy encaminha tudo para o servidor real da GNJoy
4. Quando detecta um pacote `0x0825` (SSO Login, 417 bytes), extrai o token Base64
5. Salva automaticamente no `.env` como `RO_AUTH_TOKEN`
6. O `playerCountService` usa esse token para consultar a contagem de jogadores

## Detalhes Técnicos

- **Pacote capturado:** `0x0825` (CA_SSO_LOGIN_REQ), 417 bytes
- **Token:** Base64, ~325 caracteres, offset 92 no pacote
- **DNS:** O proxy usa DNS público (8.8.8.8) para resolver o IP real do servidor,
  garantindo que não faz loop para si mesmo
- **Transparência:** Todo o tráfego é encaminhado sem modificação. O jogo funciona
  100% normalmente

## Desfazendo a Configuração

Para reverter:
1. Pare o proxy: `/token-capture stop`
2. No Windows, remova a linha adicionada do arquivo `hosts`
3. O jogo voltará a conectar diretamente ao servidor

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Porta 6900 em uso | Use `sudo` ou `setcap` no Linux |
| Jogo não conecta | Verifique se o IP no hosts está correto (`ping <linux-ip>`) |
| Token não capturado | Verifique `/token-capture status` - deve mostrar conexões |
| Token expirado | Faça login no jogo novamente para capturar um novo |
