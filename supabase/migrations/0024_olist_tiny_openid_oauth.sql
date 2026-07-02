update integration_connections
set
  settings = settings
    || jsonb_build_object(
      'app_base_url', 'https://accounts.tiny.com.br',
      'authorize_path', '/realms/tiny/protocol/openid-connect/auth',
      'token_path', '/realms/tiny/protocol/openid-connect/token',
      'scopes', jsonb_build_array('openid')
    ),
  updated_at = now()
where provider = 'olist';

