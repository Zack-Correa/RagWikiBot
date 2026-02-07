/**
 * Slash Command: /ajuda
 * Shows help information about available commands
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ajuda')
        .setDescription('Mostra informações sobre os comandos disponíveis'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📚 Comandos Disponíveis')
            .setDescription('Lista completa de comandos do RagWiki Bot')
            .addFields(
                {
                    name: '🔍 Busca no Divine Pride',
                    value: 'Os comandos abaixo detectam automaticamente se você está buscando por **nome** ou **ID**:',
                    inline: false
                },
                {
                    name: '/buscar-item',
                    value: 'Busca itens por nome ou ID\n**Ex:** `/buscar-item busca:Poring` ou `/buscar-item busca:501`',
                    inline: true
                },
                {
                    name: '/buscar-monstro',
                    value: 'Busca monstros por nome ou ID\n**Ex:** `/buscar-monstro busca:Poring`',
                    inline: true
                },
                {
                    name: '/buscar-mapa',
                    value: 'Busca mapas por nome ou ID\n**Ex:** `/buscar-mapa busca:Prontera`',
                    inline: true
                },
                {
                    name: '📚 Wiki e Mercado',
                    value: '\u200b',
                    inline: false
                },
                {
                    name: '/wiki',
                    value: 'Busca informações na Browiki\n**Ex:** `/wiki termo:Poring`',
                    inline: true
                },
                {
                    name: '/buscar-mercado',
                    value: 'Busca itens no mercado oficial LATAM\n**Ex:** `/buscar-mercado busca:Adaga tipo:Vendendo servidor:Freya`',
                    inline: true
                },
                {
                    name: '💰 Preços e Alertas',
                    value: '\u200b',
                    inline: false
                },
                {
                    name: '/alerta-mercado',
                    value: 'Gerencia alertas de mercado\n**Subcomandos:** `adicionar`, `listar`, `remover`, `limpar`, `status`\n**Ex:** `/alerta-mercado adicionar item:Adaga preco-maximo:10000`',
                    inline: true
                },
                {
                    name: '/preco-justo',
                    value: 'Analisa se um preço está justo\n**Ex:** `/preco-justo item:Adaga preco:5000`',
                    inline: true
                },
                {
                    name: '/historico-preco',
                    value: 'Mostra histórico de preços\n**Ex:** `/historico-preco item:Adaga dias:7`',
                    inline: true
                },
                {
                    name: '🔐 Contas Compartilhadas',
                    value: 'Gerencia contas compartilhadas com TOTP 2FA\n**Subcomandos:** `ver`, `criar`, `editar`, `deletar`, `permissao`, `totp`, `historico`, `listar`\n**Ex:** `/conta criar nome:Minha Conta login:usuario@email.com`\n**Novo!** Configure TOTP via QR Code com `/conta totp`\n**Novo!** Veja histórico de acessos com `/conta historico`',
                    inline: false
                },
                {
                    name: '👥 Grupos para Instâncias',
                    value: 'Cria grupos para instâncias com notificações automáticas\n**Subcomandos:** `criar`, `listar`, `entrar`, `sair`, `cancelar`, `sortear`\n**Ex:** `/grupo criar instancia:Torre sem Fim data:08/02 hora:20:00`',
                    inline: false
                },
                {
                    name: '📊 Status e Notícias',
                    value: '\u200b',
                    inline: false
                },
                {
                    name: '/servidor-status',
                    value: 'Mostra status dos servidores RO LATAM\n**Ex:** `/servidor-status servidor:Freya`',
                    inline: true
                },
                {
                    name: '/eventos',
                    value: 'Mostra últimas notícias do GNJoy LATAM',
                    inline: true
                },
                {
                    name: '⚙️ Administração',
                    value: '\u200b',
                    inline: false
                },
                {
                    name: '/plugin',
                    value: 'Gerencia plugins do bot\n**Subcomandos:** `listar`, `ativar`, `desativar`, `status`',
                    inline: true
                },
                {
                    name: '📖 Documentação',
                    value: 'Acesse [GitHub](https://github.com/Zack-Correa/RagWikiBot/blob/dev/README_PT-BR.md) para documentação completa',
                    inline: false
                }
            )
            .setFooter({ text: 'Digite / para ver todos os comandos com autocomplete' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};

