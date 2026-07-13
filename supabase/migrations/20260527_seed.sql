-- Inserção de Produtos de Referência (Seed Data sem SKU)
INSERT INTO produtos (nome, fabricante, custo_referencia) VALUES
('Servidor HCI Dell VxRail E660 (2x Xeon 4314, 256GB RAM, 10TB SSD)', 'Dell Technologies', 45000.00),
('Licença VMware vSphere Enterprise Plus (Por Core/1 Ano)', 'VMware', 1800.00),
('Instância AWS EC2 m6i.4xlarge (1 Ano Reservado)', 'AWS', 3500.00),
('Armazenamento Azure Blob Storage LRS - 10TB/Mês', 'Microsoft Azure', 220.00),
('Servidor HPE ProLiant DL380 Gen11 (1x Xeon 4410Y, 64GB RAM, 2x 1.2TB SAS)', 'HPE', 18500.00),
('Switch Cisco Catalyst 9300 48 Portas PoE+', 'Cisco Systems', 6200.00),
('Licença Veeam Availability Suite (Pacote com 10 Instâncias)', 'Veeam', 1450.00),
('Licença Oracle Database Standard Edition 2', 'Oracle', 17500.00),
('Firewall Fortinet FortiGate 100F (Incluso 1 Ano FortiGuard)', 'Fortinet', 8900.00)
ON CONFLICT (nome, fabricante) DO UPDATE SET
    custo_referencia = EXCLUDED.custo_referencia;
