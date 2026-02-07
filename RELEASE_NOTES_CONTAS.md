# 🔐 Novo Plugin: Contas Compartilhadas

## 🎉 O que é?

Sistema completo para compartilhar contas do Ragnarok Online de forma **segura e organizada** dentro do seu servidor Discord.

## ✨ Principais Recursos

### 🔒 Segurança Máxima
- **Criptografia AES-256-GCM** - Todas as senhas e secrets são criptografados
- **TOTP 2FA** - Suporte completo ao Google Authenticator
- **Credenciais via DM** - Nunca aparecem em canais públicos

### 📱 Configuração Fácil
- **QR Code para TOTP** - Configure 2FA escaneando um QR Code (via DM ou painel web)
- **Interface Web** - Gerencie tudo pelo painel admin com upload de QR Code
- **Códigos OTP Auto-Atualizáveis** - Receba códigos que atualizam automaticamente por 3 minutos

### 👥 Permissões Granulares
- **Controle total** - Defina quem pode acessar cada conta
- **Permissões por usuário, nome ou cargo**
- **Listas de permitir/negar** - Controle fino de acesso

### 📊 Auditoria Completa
- **Log de acessos** - Veja quem acessou cada conta e quando
- **Rastreamento completo** de todas as operações

## 🚀 Como Usar

### Criar uma Conta
```
/conta criar nome:Minha Conta login:usuario@email.com servidor:Freya
```

### Configurar TOTP (2FA)
```
/conta totp conta:Minha Conta
```
O bot enviará uma DM pedindo o QR Code do Google Authenticator. Envie a imagem e pronto!

### Ver Credenciais
```
/conta ver nome:Minha Conta
```
Receba login, senha, senha Kafra e código OTP atualizado via DM.

### Gerenciar Permissões
```
/conta permissao conta:Minha Conta acao:Adicionar tipo:ID do Usuário valor:123456789
```

## 💡 Dicas

- Use o **painel web** (`http://localhost:3000`) para gerenciar contas visualmente
- Códigos OTP atualizam **automaticamente** na DM por 3 minutos
- Configure TOTP via **QR Code** para máxima segurança
- Use **permissões por cargo** para dar acesso a grupos inteiros

## 🔧 Requisitos

- Plugin `shared-accounts` ativado
- Variável `ENCRYPTION_KEY` configurada no `.env` (64 caracteres hex)

---

**Versão:** 1.0.0  
**Comando:** `/conta`  
**Documentação:** Use `/ajuda` para ver todos os subcomandos
