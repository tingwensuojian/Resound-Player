"""Update Docker Hub repository description from DOCKER_HUB.md template."""
import os, json, urllib.request

# Read description template and substitute version
with open('deploy/DOCKER_HUB.md', 'r', encoding='utf-8') as f:
    description = f.read().replace('{{VERSION}}', os.environ['VERSION'])

# Authenticate with Docker Hub
login_data = json.dumps({
    'username': os.environ['DOCKER_USERNAME'],
    'password': os.environ['DOCKER_PASSWORD']
}).encode('utf-8')

req = urllib.request.Request(
    'https://hub.docker.com/v2/users/login/',
    data=login_data,
    headers={'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read())['token']

# Update repository description
update_data = json.dumps({
    'full_description': description
}).encode('utf-8')

req = urllib.request.Request(
    f'https://hub.docker.com/v2/repositories/{os.environ["IMAGE_NAME"]}/',
    data=update_data,
    headers={
        'Content-Type': 'application/json',
        'Authorization': f'JWT {token}'
    },
    method='PATCH'
)
with urllib.request.urlopen(req) as resp:
    print(f'Docker Hub description updated (status {resp.status})')
