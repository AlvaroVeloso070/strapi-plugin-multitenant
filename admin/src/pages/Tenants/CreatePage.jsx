import React from 'react';
import {
  Button,
  Flex,
  Grid,
  TextInput,
  Field,
} from '@strapi/design-system';
import { Check, ArrowLeft } from '@strapi/icons';
import {
  Page,
  useNotification,
  useFetchClient,
  Layouts,
} from '@strapi/strapi/admin';
import { Formik, Form } from 'formik';
import { useIntl } from 'react-intl';
import { useMutation } from 'react-query';
import { useNavigate } from 'react-router-dom';

import pluginId from '../../pluginId';
import { getTenantsUrl } from '../../utils/api';

const validate = (values) => {
  const errors = {};
  if (!values.slug) errors.slug = 'Required';
  else if (!/^[a-z0-9-]+$/.test(values.slug)) {
    errors.slug = 'Only lowercase letters, numbers, and hyphens';
  }
  if (!values.name) errors.name = 'Required';
  return errors;
};

const TenantCreatePage = () => {
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  const { post } = useFetchClient();

  const mutation = useMutation({
    mutationFn: (body) => post(getTenantsUrl(), body),
    onSuccess: () => {
      toggleNotification({
        type: 'success',
        message: formatMessage({
          id: `${pluginId}.tenant.created`,
          defaultMessage: 'Tenant created successfully',
        }),
      });
      navigate('..');
    },
    onError: (err) => {
      const msg = err?.response?.data?.error?.message ?? err?.message;
      toggleNotification({
        type: 'danger',
        message: msg || formatMessage({
          id: `${pluginId}.error`,
          defaultMessage: 'Error creating tenant',
        }),
      });
    },
  });

  return (
    <Page.Main>
      <Page.Title>
        {formatMessage(
          { id: 'Settings.PageTitle', defaultMessage: 'Settings - {name}' },
          { name: formatMessage({ id: `${pluginId}.add`, defaultMessage: 'Add tenant' }) }
        )}
      </Page.Title>
      <Formik
        initialValues={{ slug: '', name: '' }}
        validate={validate}
        onSubmit={(values) => mutation.mutate(values)}
      >
        {({ handleSubmit, values, handleBlur, setFieldValue, errors }) => (
          <Form noValidate onSubmit={handleSubmit}>
            <Layouts.Header
              primaryAction={
                <Button
                  type="submit"
                  loading={mutation.isLoading}
                  startIcon={<Check />}
                >
                  {formatMessage({ id: 'global.save', defaultMessage: 'Save' })}
                </Button>
              }
              title={formatMessage({
                id: `${pluginId}.create.title`,
                defaultMessage: 'Create tenant',
              })}
              subtitle={formatMessage({
                id: `${pluginId}.create.subtitle`,
                defaultMessage: 'The slug will be used as the subdomain (e.g.: acme.localhost)',
              })}
              navigationAction={
                <Button variant="tertiary" onClick={() => navigate('..')} startIcon={<ArrowLeft />} size="S">
                  {formatMessage({ id: 'global.back', defaultMessage: 'Back' })}
                </Button>
              }
            />
            <Layouts.Content>
              <Flex
                background="neutral0"
                direction="column"
                alignItems="stretch"
                gap={7}
                hasRadius
                paddingTop={6}
                paddingBottom={6}
                paddingLeft={7}
                paddingRight={7}
                shadow="filterShadow"
              >
                <Grid.Root gap={4}>
                  <Grid.Item col={6} xs={12}>
                    <Field.Root
                      name="slug"
                      error={errors.slug}
                      required
                    >
                      <Field.Label>
                        {formatMessage({ id: 'global.slug', defaultMessage: 'Slug' })}
                      </Field.Label>
                      <TextInput
                        name="slug"
                        value={values.slug || ''}
                        onChange={(e) => setFieldValue('slug', e.target.value)}
                        onBlur={handleBlur}
                        placeholder="acme"
                      />
                      <Field.Hint>
                        {formatMessage({
                          id: `${pluginId}.slug.hint`,
                          defaultMessage: 'e.g.: acme → acme.localhost',
                        })}
                      </Field.Hint>
                      <Field.Error />
                    </Field.Root>
                  </Grid.Item>
                  <Grid.Item col={6} xs={12}>
                    <Field.Root
                      name="name"
                      error={errors.name}
                      required
                    >
                      <Field.Label>
                        {formatMessage({ id: 'global.name', defaultMessage: 'Name' })}
                      </Field.Label>
                      <TextInput
                        name="name"
                        value={values.name || ''}
                        onChange={(e) => setFieldValue('name', e.target.value)}
                        onBlur={handleBlur}
                        placeholder="Acme Corp"
                      />
                      <Field.Error />
                    </Field.Root>
                  </Grid.Item>
                </Grid.Root>
              </Flex>
            </Layouts.Content>
          </Form>
        )}
      </Formik>
    </Page.Main>
  );
};

export default TenantCreatePage;
