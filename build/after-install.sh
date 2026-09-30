#!/bin/bash
# MindZ deb 安装后脚本（替代 electron-builder 默认 postinst）
# 关键差异：Ubuntu 24.04 的 AppArmor 会拦截 Electron 28 创建 unprivileged
# user namespace（即使 unshare 测试通过），导致 Electron 回退 setuid sandbox
# 失败而启动即退出。因此强制 chrome-sandbox 为 root:root + 4755。

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/mindz' -a -e '/usr/bin/mindz' -a "`readlink '/usr/bin/mindz'`" != '/etc/alternatives/mindz' ]; then
        rm -f '/usr/bin/mindz'
    fi
    update-alternatives --install '/usr/bin/mindz' 'mindz' '/opt/MindZ/mindz' 100 || ln -sf '/opt/MindZ/mindz' '/usr/bin/mindz'
else
    ln -sf '/opt/MindZ/mindz' '/usr/bin/mindz'
fi

# SUID chrome-sandbox：Electron 官方推荐的 Linux 沙箱部署方式
chmod 4755 '/opt/MindZ/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# 刷新 hicolor 图标缓存，确保应用菜单立即可见图标
if hash gtk-update-icon-cache 2>/dev/null; then
    gtk-update-icon-cache -f /usr/share/icons/hicolor || true
fi

exit 0