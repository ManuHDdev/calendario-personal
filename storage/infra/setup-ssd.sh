#!/bin/bash
set -e

echo "=== Preparando SSD /dev/sdb para storage ==="

# Formatear la partición /dev/sdb2 como ext4
echo "Formateando /dev/sdb2 como ext4..."
mkfs.ext4 -F /dev/sdb2

# Crear punto de montaje
echo "Creando punto de montaje /mnt/storage-ssd..."
mkdir -p /mnt/storage-ssd

# Obtener UUID del disco para montaje permanente
UUID=$(blkid -s UUID -o value /dev/sdb2)
echo "UUID detectado: $UUID"

# Añadir entrada a /etc/fstab si no existe ya
if ! grep -q "$UUID" /etc/fstab; then
    echo "UUID=$UUID /mnt/storage-ssd ext4 defaults,nofail 0 2" >> /etc/fstab
    echo "Entrada añadida a /etc/fstab"
else
    echo "Ya existe entrada en /etc/fstab, saltando..."
fi

# Montar
mount -a
echo "Montado. Verificando..."
df -h /mnt/storage-ssd

# Permisos para que Docker pueda escribir
chmod 777 /mnt/storage-ssd
echo "=== SSD listo ==="
