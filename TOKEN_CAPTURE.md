# Captura Automatica de Token SSO

## Arquitetura

```
  Windows (sua maquina)              Linux (servidor do bot)
  +--------------+   hosts file     +----------------------+
  |  ragexe.exe  |----------------->|  Token Capture Proxy  |
  |  (jogo RO)   |  aponta p/ Linux|  0.0.0.0:6900        |
  +--------------+                  |                      |
                                    |  Captura 0x0825      |
                                    |  Salva .env          |
                                    |                      |
                                    |    +--------------+  |
                                    |--->| Servidor Real |  |
                                    |<---| GNJoy LATAM  |  |
                                    |    +--------------+  |
                                    +----------------------+
```

O proxy e **100% transparente**: o jogo funciona normalmente, e o token e
capturado automaticamente quando voce faz login.

## Instalacao

O token capture e um **plugin**. Para ativar:

```
/plugin enable token-capture
```

## Configuracao

### 1. No Linux (uma vez)

```bash
# O bot ja inclui o proxy como plugin. Basta iniciar o bot e ativar:
node app.js
# Depois no Discord: /plugin enable token-capture

# Ou rodar o proxy standalone (sem bot):
sudo node scripts/start-token-capture.js
```

> **Nota:** A porta 6900 requer `sudo` no Linux. Alternativa: use `setcap`
> para dar permissao ao node:
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

1. No Discord: `/token-capture start`
2. Abrir Ragnarok Online normalmente
3. Fazer login com usuario, senha e OTP
4. O token e capturado automaticamente
5. O bot usa o token para consultar o player count

## Comandos Discord

| Comando | Descricao |
|---------|-----------|
| `/plugin enable token-capture` | Ativa o plugin |
| `/token-capture start` | Inicia o proxy de captura |
| `/token-capture stop` | Para o proxy |
| `/token-capture status` | Mostra status, conexoes e ultimo token |

## Como Funciona

1. O Windows resolve `lt-account-01.gnjoylatam.com` para o IP do Linux (via hosts file)
2. O jogo conecta ao proxy no Linux na porta 6900
3. O proxy encaminha tudo para o servidor real da GNJoy
4. Quando detecta um pacote `0x0825` (SSO Login, 417 bytes), extrai o token Base64
5. Salva automaticamente no `.env` como `RO_AUTH_TOKEN`
6. O `playerCountService` usa esse token para consultar a contagem de jogadores

## Detalhes Tecnicos

- **Pacote capturado:** `0x0825` (CA_SSO_LOGIN_REQ), 417 bytes
- **Token:** Base64, ~325 caracteres, offset 92 no pacote
- **DNS:** O proxy usa DNS publico (8.8.8.8) para resolver o IP real do servidor,
  garantindo que nao faz loop para si mesmo
- **Transparencia:** Todo o trafego e encaminhado sem modificacao. O jogo funciona
  100% normalmente

## Desfazendo a Configuracao

Para reverter:
1. Pare o proxy: `/token-capture stop`
2. No Windows, remova a linha adicionada do arquivo `hosts`
3. O jogo voltara a conectar diretamente ao servidor

## Troubleshooting

| Problema | Solucao |
|----------|---------|
| Porta 6900 em uso | Use `sudo` ou `setcap` no Linux |
| Jogo nao conecta | Verifique se o IP no hosts esta correto (`ping <linux-ip>`) |
| Token nao capturado | Verifique `/token-capture status` - deve mostrar conexoes |
| Token expirado | Faca login no jogo novamente para capturar um novo |
| Plugin nao aparece | Verifique se a pasta `plugins/token-capture/` existe |
