// Explicit allowlist: never serialize credentials or internal authentication state.
function publicUser(user) {
  return {
    id: user.id || String(user._id), _id: user._id,
    email: user.email, username: user.username,
    name: user.name, role: user.role, isAdmin: user.isAdmin,
    isVerified: user.isVerified, phone: user.phone, address: user.address,
    createdAt: user.createdAt,
  };
}

module.exports = publicUser;
